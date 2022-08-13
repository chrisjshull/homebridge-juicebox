// Copyright 2022 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, WithUUID } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { JuiceBoxPlatformAccessoryHandler } from './platformAccessory';

import juicenet from './juicenet';
import fakegato from 'fakegato-history';


/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class JuiceBoxHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public readonly FakeGatoHistoryService = fakegato(this.api);

  public Volts: WithUUID<new () => Characteristic>; // todo type as Characteristic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public Amperes: WithUUID<new () => Characteristic>; // todo type as Characteristic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public Watts: WithUUID<new () => Characteristic>; // todo type as Characteristic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public KilowattHours: WithUUID<new () => Characteristic>; // todo type as Characteristic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public VoltAmperes: WithUUID<new () => Characteristic>; // todo type as Characteristic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public KilowattVoltAmpereHour: WithUUID<new () => Characteristic>; // todo type as Characteristic

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    const makeCharacteristic = (name: string, unit: string, minStep: number, uuid: string, format = api.hap.Formats.FLOAT) => {
      return class extends this.Characteristic {
        public static readonly UUID: string = uuid;
        constructor() {
          super(name, uuid, {
            format,
            minValue: 0,
            maxValue: 65535,
            unit,
            minStep,
            perms: [api.hap.Perms.PAIRED_READ, api.hap.Perms.NOTIFY],
          });
          this.value = this.getDefaultValue();
        }
      };
    };
    // https://github.com/snowman715/homebridge_tplink_kasa/tree/50a3b8c84feb400c9f687439fa77f7ef8b039a8b/src/characteristics
    this.Volts = makeCharacteristic('Volts', 'V', 0.1, 'E863F10A-079E-48FF-8F27-9C2605A29F52');
    this.Amperes = makeCharacteristic('Amperes', 'A', 0.01, 'E863F126-079E-48FF-8F27-9C2605A29F52');
    this.Watts = makeCharacteristic('Consumption', 'W', 0.1, 'E863F10D-079E-48FF-8F27-9C2605A29F52');
    this.KilowattHours = makeCharacteristic('Total Consumption', 'kWh', 0.001, 'E863F10C-079E-48FF-8F27-9C2605A29F52');
    this.VoltAmperes = makeCharacteristic('Apparent Power', 'VA', 0.1, 'E863F10C-079E-48FF-8F27-9C2605A29F52');
    this.KilowattVoltAmpereHour =
      makeCharacteristic('Apparent Energy', 'kVAh', 1, 'E863F10C-079E-48FF-8F27-9C2605A29F52', api.hap.Formats.UINT32);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      try {
        await this.discoverDevices();
      } catch (e) {
        this.log.error('' + e);
      }
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * Register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    const cachedNotFound = new Set(this.accessories);
    const { devices, response } = await juicenet.getDevicesAsync(this.config.apiToken);
    if (!response.body.success) {
      this.log.error(response.body);
      throw new Error('Could not connect to JuiceNet.');
    }

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of devices) {
      if (this.config.ignoredIds && this.config.ignoredIds.includes(device.unit_id)) {
        this.log.info('Skipping device with ID: ' + device.unit_id);
        continue;
      }

      // generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.unit_id);

      // see if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
      if (existingAccessory) {
        cachedNotFound.delete(existingAccessory);
      }

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.device = device;
        this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new JuiceBoxPlatformAccessoryHandler(this, existingAccessory);
      } else {
        // the accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.name);

        // create a new accessory
        const accessory = new this.api.platformAccessory(device.name, uuid);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        accessory.context.device = device;

        // create the accessory handler for the newly create accessory
        // this is imported from `platformAccessory.ts`
        new JuiceBoxPlatformAccessoryHandler(this, accessory);

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    for (const existingAccessory of cachedNotFound) {
      // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
      // remove platform accessories when no longer present
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
      this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
    }
  }
}
