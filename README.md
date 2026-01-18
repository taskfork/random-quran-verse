# Random Quran Verse

A simple, native-feeling Obsidian plugin that allows you to embed a dynamic card that retrieves a random verse from the Holy Quran every time you open your note. It features custom styling, automatic translation fetching, and Uthmanic font support.

![Screenshot of Random Quran Verse](https://raw.githubusercontent.com/taskfork/random-quran-verse/refs/heads/master/rqv-screen.png "Screenshot of Random Quran Verse")

## Features

* **Code block embedding**: Use simple quran code blocks to insert verses. These refresh everytime you open your note, perfect for your home page or other dashboards.

* **Dynamic styling**: Customize background colors, accent borders, and font sizes directly from the settings.  

* **Translation support**: Choose from multiple languages and specific translation editions (powered by the Al Quran Cloud API).  

* **Copy to clipboard**: Easily copy the Arabic text and translation for use elsewhere.

## Usage

Simply insert the following code block into your note:

```

	```quran-verse

	```

```

## Installation

### From Community Plugins

1. Open Obsidian **Settings**.  

2. Go to **Community plugins** \> **Browse**.  

3. Search for "Random Quran Verse".  

4. Click **Install**, then **Enable**.

### Manual Installation

1. Download the latest release (main.js, manifest.json, styles.css).  

2. Create a folder named random-quran-verse in your vault's .obsidian/plugins/ directory.  

3. Move the downloaded files into that folder.  

4. Reload Obsidian and enable the plugin in **Community plugins**.

## Attributions

**Al Quran Cloud APIs**

The Quran verses are retrieved using the [Al Quran Cloud APIs](https://alquran.cloud/api). An open-source Quran API made by the [Islamic Network](https://islamic.network/) and respective [contributors](https://alquran.cloud/contributors).

## License

This project is licensed under the MIT License.

