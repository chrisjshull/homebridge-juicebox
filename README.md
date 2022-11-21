
<p style="text-align: center">

<img alt="Homebridge" src="https://github.com/homebridge/branding/raw/master/logos/homebridge-wordmark-logo-vertical.png" width="150"> 

<img alt="EV Charger" src="https://user-images.githubusercontent.com/877679/203036918-5cf9dc33-a14b-450e-9413-77d4f7abf0aa.svg" width="150">

</p>


# Homebridge JuiceBox

Exposes your JuiceBox EV chargers as outlets in HomeKit. Also exposes the "in use" characteristic for when a car is plugged in or not ("in use" can be true even when the charger is not providing power), as well as the Volts, Amps, Watts, Kilowatt Hours, and Current Temperature as reported by each device.

Stopping charging attempts to act as much like stopping charging from the "EV JuiceNet" app as possible (which appears to be achieved by delaying charging for ~1 year).

## Setup

To get your JuiceNet API Token, go to https://home.juice.net/Manage and click "Generate API Token".

If you have multiple JuiceBox devices on your account, but only want to expose some of them (e.g. for different homes) then you can specify `ignoredIds` - device IDs can be found at https://home.juice.net/Portal.

Example config.json:
```
{
    "platform": "JuiceBoxHomebridgePlugin"
    "apiToken": "...required...",
    "ignoredIds": [
        "...optional..."
    ]
}
```

## Development

### Setup Development Environment

To develop Homebridge plugins you must have Node.js 12 or later installed, and a modern code editor such as [VS Code](https://code.visualstudio.com/). This plugin template uses [TypeScript](https://www.typescriptlang.org/) to make development easier and comes with pre-configured settings for [VS Code](https://code.visualstudio.com/) and ESLint. If you are using VS Code install these extensions:

* [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

### Install Development Dependencies

Using a terminal, navigate to the project folder and run this command to install the development dependencies:

```
npm install
```

### Build Plugin

TypeScript needs to be compiled into JavaScript before it can run. The following command will compile the contents of your [`src`](./src) directory and put the resulting code into the `dist` folder.

```
npm run build
```

### Link To Homebridge

Run this command so your global install of Homebridge can discover the plugin in your development environment:

```
npm link
```

You can now start Homebridge, use the `-D` flag so you can see debug log messages in your plugin:

```
homebridge -D
```

### Watch For Changes and Build Automatically

If you want to have your code compile automatically as you make changes, and restart Homebridge automatically between changes you can run:

```
npm run watch
```

This will launch an instance of Homebridge in debug mode which will restart every time you make a change to the source code. It will load the config stored in the default location under `~/.homebridge`. You may need to stop other running instances of Homebridge while using this command to prevent conflicts. You can adjust the Homebridge startup command in the [`nodemon.json`](./nodemon.json) file.

# TODO...

### Customise Plugin

You can now start customising the plugin template to suit your requirements.

* [`src/platform.ts`](./src/platform.ts) - this is where your device setup and discovery should go.
* [`src/platformAccessory.ts`](./src/platformAccessory.ts) - this is where your accessory control logic should go, you can rename or create multiple instances of this file for each accessory type you need to implement as part of your platform plugin. You can refer to the [developer documentation](https://developers.homebridge.io/) to see what characteristics you need to implement for each service type.
* [`config.schema.json`](./config.schema.json) - update the config schema to match the config you expect from the user. See the [Plugin Config Schema Documentation](https://developers.homebridge.io/#/config-schema).


### Publish Package

When you are ready to publish your plugin to [npm](https://www.npmjs.com/), make sure you have removed the `private` attribute from the [`package.json`](./package.json) file then run:

```
npm publish
```

If you are publishing a scoped plugin, i.e. `@username/homebridge-xxx` you will need to add `--access=public` to command the first time you publish.

#### Publishing Beta Versions

You can publish *beta* versions of your plugin for other users to test before you release it to everyone.

```bash
# create a new pre-release version (eg. 2.1.0-beta.1)
npm version prepatch --preid beta

# publsh to @beta
npm publish --tag=beta
```

Users can then install the  *beta* version by appending `@beta` to the install command, for example:

```
sudo npm install -g homebridge-juicebox@beta
```

This is not an officially supported Google product.
