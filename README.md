<p align="center">
  <img src="https://flb-assets.s3.ap-southeast-1.amazonaws.com/static/fleetbase-logo-svg.svg" width="380" height="100" />
</p>
<p align="center">
Open source navigation and fleetbase order management for drivers/agents.
</p>

<p align="center">
  <a href="https://fleetbase.io">fleetbase.io</a> | <a href="https://twitter.com/fleetbase_io">@fleetbase_io</a> | <a href="https://discord.gg/fjP4sReEvH">Discord</a>
</p>

<p align="center">
	<img src="https://user-images.githubusercontent.com/816371/154444685-c21ef84c-03d8-4656-8624-638688a292b8.png" width="220" height="416" />
	<img src="https://user-images.githubusercontent.com/816371/154444705-b3226353-81f8-4292-8228-0b1a0196e628.png" width="220" height="416" />
</p>

## Table of Contents

 - [About](#about)
 - [Prerequisites](#prerequisites)
 - [Installation](#installation)
	 - [Configure Environment](#configure-environment)
 - [Running in Simulator](#running-in-simulator)
	 - [Run the app in iOS Simulator](#run-the-app-in-ios-simulator)
	 - [Run the app in Android Simulator](#run-the-app-in-android-simulator)
 - [Navigation using Mapbox](#navigation-using-mapbox)
 - [Documentation](#documentation)
 - [Roadmap](#roadmap)

### About
Fleetbase Navigator is an open source navigation and order management app for drivers and agents using Fleetbase. This app is fully customizable and supports QR code scanning, digital signatures, and routing and navigation for agents. Drivers will be able to update activity to orders on the run as they complete job. Drivers can also manage their wallet and view earnings, and Navigator also provides a schedule view for a comprehensive view of the drivers tasks for the day.

### Prerequisites
 - [Yarn](https://yarnpkg.com/) or [NPM](https://nodejs.org/en/)
 - [React Native CLI](https://reactnative.dev/docs/environment-setup)
 - Xcode 12+
 - Android Studio

### Installation
Installation and setup is fairly quick, all you need is your Fleetbase API Key, and a few commands and your app will be up and running in minutes. Follow the directions below to get started.

Run the commands below; first clone the project, use npm or yarn to install the dependencies, then run `npx pod-install` to install the iOS dependencies. Lastly, create a `.env` file to configure the app.
```
git clone git@github.com:fleetbase/navigator-app.git
cd navigator-app
yarn
npx pod-install
touch .env
```
### Configure Environment
Below is the steps needed to configure the environment. The first part covers collecting your required API keys.

 1. Get your API Keys; 
 2. **If you don't have a Fleetbase account already** proceed to the [Fleetbase Console](https://console.fleetbase.io/) and click "Create an account", complete the registration form and you will be taken to the console. 
 3. Once you're in the Fleetbase console select the "Developers" button in the top navigation. Next, select API Keys from the menu in the Developers section, and create a new API key. Copy your secret key generated, you'll need it later.
 4. Once you have both required API keys open your `.env` file.

In your `.env` file supply your Fleetbase API secret key, and additionally you will need a Google Maps API Key. Lastly, you'll also need to supply your app/bundle identifier, and an `APP_NAME` key.

Your `.env` file should look something like this once you're done.

```
# .env
APP_NAME=
APP_IDENTIFIER=io.navigator.app
APP_LINK_PREFIX=navigator://
FLEETBASE_HOST=https://127.0.0.1:8000
FLEETBASE_KEY=
```

### Running in Simulator
Once you have completed the installation and environment configuration, you're all set to give your app a test-drive in the simulator so you can play around.

#### Run the App in iOS Simulator
```
npx react-native run-ios
```
#### Run the App in Android Simulator
```
npx react-native run-android
```

### Documentation
See the [documentation webpage](https://fleetbase.io/docs).

If you would like to make contributions to the Fleetbase Javascript SDK documentation source, here is a [guide](https://github.com/fleetbase/fleetbase-js/blob/master/CONTRIBUTING.md) in doing so.

### Roadmap
 - COMING SOON
