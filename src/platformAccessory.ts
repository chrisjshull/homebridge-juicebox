import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { JuiceBoxHomebridgePlatform } from './platform';

import juicenet from './juicenet';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class JuiceBoxPlatformAccessoryHandler {
  private pollTimeoutId: NodeJS.Timeout|null = null;

  private service: Service;
  private loggingService: { addEntry: (arg0: { time: number; power: CharacteristicValue }) => void };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private state: { state?: any; target_time?: any; default_target_time?: any; unit_time?: any; charging?: any } = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private overrides: { on?: any } = {};

  private error: unknown = null;


  constructor(
    private readonly platform: JuiceBoxHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    const Characteristic = platform.Characteristic;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, 'Enel X')
      .setCharacteristic(Characteristic.Model, 'JuiceBox [Unknown]')
      .setCharacteristic(Characteristic.SerialNumber, accessory.context.device.unit_id);

    // get the Outlet service if it exists, otherwise create a new Outlet service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Outlet) || this.accessory.addService(this.platform.Service.Outlet);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(Characteristic.Name, accessory.context.device.name);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    this.service.getCharacteristic(Characteristic.OutletInUse)
      .onGet(this.getOutletInUse.bind(this));

    this.service.getCharacteristic(this.platform.Volts)
      .onGet(this.getVolts.bind(this));
    this.service.getCharacteristic(this.platform.Amperes)
      .onGet(this.getAmperes.bind(this));
    this.service.getCharacteristic(this.platform.Watts)
      .onGet(this.getWatts.bind(this));
    this.service.getCharacteristic(this.platform.KilowattHours)
      .onGet(this.getKilowattHours.bind(this));
    // this.service.getCharacteristic(this.platform.VoltAmperes)
    //   .onGet(this.getVoltAmperes.bind(this));
    // this.service.getCharacteristic(this.platform.KilowattVoltAmpereHour)
    //   .onGet(this.getKilowattVoltAmpereHour.bind(this));

    // built in timer never starts?
    this.loggingService = new this.platform.FakeGatoHistoryService(
      'energy', accessory, { size: 120960, disableTimer: true, storage: 'fs', log: this.platform.log });
    // this.platform.api['globalFakeGatoTimer'].start();
    this.pausePolling(0); // start polling
  }

  private pausePolling(ms = 1000) {
    this.pollTimeoutId && clearTimeout(this.pollTimeoutId);
    this.pollTimeoutId = setTimeout(() => {
      this.pausePolling(10000);
      this.poll();
    }, ms);
  }

  private async poll() {
    this.platform.log.debug('Polling...');
    try {
      const startPollTimeoutId = this.pollTimeoutId;
      const {chargerState} =
        await this.handleJuiceNetErrors(juicenet.getDeviceStateAsync(this.platform.config.apiToken, this.accessory.context.device.token));
      if (startPollTimeoutId !== this.pollTimeoutId) {
        return; // ignore if polling was deferred
      }

      this.platform.log.debug('Updating from poll...');

      if (chargerState.state === 'error' || chargerState.state === 'disconnect') {
        throw new Error('chargerState.state = ' + chargerState.state);
      }

      // this.platform.log.debug(chargerState);

      this.state = chargerState;
      this.error = null;
      this.overrides = {};
      // this does not work dynamically:
      // this.service.getCharacteristic(this.platform.Characteristic.On).setProps({
      //   perms: chargerState.state === 'standby'
      //     ? [Perms.PAIRED_READ, Perms.NOTIFY] : [Perms.PAIRED_WRITE, Perms.PAIRED_READ, Perms.NOTIFY],
      // });
      this.service.updateCharacteristic(this.platform.Characteristic.On, await this.getOn());
      this.service.updateCharacteristic(this.platform.Characteristic.OutletInUse, await this.getOutletInUse());
      this.service.updateCharacteristic(this.platform.Volts, await this.getVolts());
      this.service.updateCharacteristic(this.platform.Amperes, await this.getAmperes());
      this.service.updateCharacteristic(this.platform.Watts, await this.getWatts());
      this.service.updateCharacteristic(this.platform.KilowattHours, await this.getKilowattHours());
      // this.service.updateCharacteristic(this.platform.VoltAmperes, await this.getVoltAmperes());
      // this.service.updateCharacteristic(this.platform.KilowattVoltAmpereHour, await this.getKilowattVoltAmpereHour());

      this.loggingService.addEntry({time: Math.round(new Date().valueOf() / 1000), power: await this.getWatts()});

    } catch (e) {
      this.platform.log.error('' + e);
      this.state = {};
      this.error = e;
      this.overrides = {};
    }
  }

  private async handleJuiceNetErrors(promise) {
    let ret;
    try {
      ret = await promise;
    } catch (e) {
      this.platform.log.error('' + e);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    if (!ret.response.body.success) {
      this.platform.log.error(ret.response.body);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    return ret;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    // todo: handle setting errors in http and in chargerState.success
    this.platform.log.debug('Set Characteristic On ->', value, typeof value);

    // todo: how to handle feedback for when car not plugged in
    this.pausePolling(30 * 1000);
    await this.poll();
    // can't turn on a charger that isn't plugged in
    if (this.error || (value && this.state.state === 'standby')) {
      this.platform.log.debug('...rejecting set');
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    this.overrides.on = value;
    if (value) {
      const {response} =
        await this.handleJuiceNetErrors(juicenet.startChargingAsync(this.platform.config.apiToken, this.accessory.context.device.token));
      this.platform.log.debug(response.body);
    } else {
      const {response} =
        await this.handleJuiceNetErrors(juicenet.stopChargingAsync(this.platform.config.apiToken, this.accessory.context.device.token));
      this.platform.log.debug(response.body);
    }

    // set seems to take ~30+=10s to "take" during which it shows the old state (for some state transitions)
    // this may be related to the device's update interval?
    // todo: this might be even longer for turning off while charging?
    this.pausePolling(30 * 1000);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possible. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getOn(): Promise<CharacteristicValue> {
    if (this.error) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    if (this.overrides.on) {
      const isOn = this.overrides.on;
      this.platform.log.debug('Get Characteristic On (override) ->', isOn);
      return isOn;
    }

    // Also show On for a plugged in car that is fully charged
    // todo: verify this in the TOU timeframe
    const isOn = this.state.state === 'charging'
      || (
        this.state.state === 'plugged'
          && this.state.target_time === this.state.default_target_time && this.state.unit_time >= this.state.default_target_time
      );
    this.platform.log.debug('Get Characteristic On ->', isOn);

    // TODO; handle other states

    return isOn;
  }

  async getOutletInUse(): Promise<CharacteristicValue> {
    if (this.error) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    const OutletInUse = this.state.state === 'charging' || this.state.state === 'plugged';
    this.platform.log.debug('Get Characteristic OutletInUse ->', OutletInUse);

    return OutletInUse;
  }

  async getVolts(): Promise<CharacteristicValue> {
    if (this.error) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const volts = this.state.charging.voltage;
    this.platform.log.debug('Get Characteristic Volts ->', volts);
    return volts;
  }

  async getAmperes(): Promise<CharacteristicValue> {
    if (this.error) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const amps = this.state.charging.amps_current;
    this.platform.log.debug('Get Characteristic Amperes ->', amps);
    return amps;
  }

  async getWatts(): Promise<CharacteristicValue> {
    if (this.error) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const value = this.state.charging.watt_power;
    this.platform.log.debug('Get Characteristic Watts ->', value);
    return value;
  }

  async getKilowattHours(): Promise<CharacteristicValue> {
    if (this.error) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const value = this.state.charging.wh_energy / 1000;
    this.platform.log.debug('Get Characteristic KilowattHours ->', value);
    return value;
  }

  // async getVoltAmperes(): Promise<CharacteristicValue> {
  //   if (this.error) {
  //     throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  //   }
  //   const value = 0;
  //   this.platform.log.debug('Get Characteristic VoltAmperes ->', value);
  //   return value;
  // }

  // async getKilowattVoltAmpereHour(): Promise<CharacteristicValue> {
  //   if (this.error) {
  //     throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  //   }
  //   const value = 0;
  //   this.platform.log.debug('Get Characteristic KilowattVoltAmpereHour ->', value);
  //   return value;
  // }
}
