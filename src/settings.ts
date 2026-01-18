import { App, PluginSettingTab, Setting, requestUrl, Notice } from 'obsidian';
import QuranPlugin from './main';

export interface QuranSettings {
	translation: string;
	language: string;
	fontSize: string;
	backgroundColor: string;
	accentColor: string;
}

export const DEFAULT_SETTINGS: QuranSettings = {
	translation: 'en.itani',
	language: 'en',
	fontSize: '2.0rem',
	backgroundColor: 'var(--background-secondary)',
	accentColor: 'var(--interactive-accent)'
}

interface LanguageResponse {
	code: number;
	status: string;
	data: string[];
}

interface Edition {
	identifier: string;
	language: string;
	name: string;
	englishName: string;
	format: string;
	type: string;
	direction: string | null;
}

interface EditionResponse {
	code: number;
	status: string;
	data: Edition[];
}

export class QuranSettingTab extends PluginSettingTab {
	plugin: QuranPlugin;
	languages: { code: string, name: string }[] = [];
	editions: Edition[] = [];
	isLoadingMetadata = false;

	constructor(app: App, plugin: QuranPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async fetchMetadata() {
		if (this.isLoadingMetadata) return;
		this.isLoadingMetadata = true;

		try {
			const langRes = await requestUrl('https://api.alquran.cloud/v1/edition/language');
			const langJson = langRes.json as LanguageResponse;

			if (langJson && langJson.data) {
				this.languages = langJson.data.map((lang: string) => ({
					code: lang,
					name: this.getFullLanguageName(lang)
				}));
				this.languages.sort((a, b) => a.name.localeCompare(b.name));
			}

			const edRes = await requestUrl(`https://api.alquran.cloud/v1/edition/language/${this.plugin.settings.language}`);
			const edJson = edRes.json as EditionResponse;

			if (edJson && edJson.data) {
				this.editions = edJson.data.filter((e: Edition) => e.format === 'text' && e.type === 'translation');
			}

			this.display();
		} catch (e) {
			console.error("Quran Plugin: Metadata fetch failed", e);
			new Notice("Quran Plugin: Failed to fetch translation metadata. Check your internet connection.");
		} finally {
			this.isLoadingMetadata = false;
		}
	}

	getFullLanguageName(code: string): string {
		const manualMap: Record<string, string> = {
			'ar': 'Arabic', 'az': 'Azerbaijani', 'ba': 'Bashkir', 'be': 'Bengali',
			'ber': 'Berber', 'bs': 'Bosnian', 'ce': 'Chechen', 'dv': 'Divehi',
			'fa': 'Persian', 'ha': 'Hausa', 'ml': 'Malayalam', 'ps': 'Pashto',
			'sd': 'Sindhi', 'si': 'Sinhala', 'sq': 'Albanian', 'sw': 'Swahili',
			'tg': 'Tajik', 'tt': 'Tatar', 'ug': 'Uyghur', 'ur': 'Urdu', 'uz': 'Uzbek'
		};
		if (manualMap[code]) return manualMap[code];
		try {
			const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
			return displayNames.of(code) || code.toUpperCase();
		} catch (e) {
			return code.toUpperCase();
		}
	}

	private resolveColor(color: string): string {
		if (color.startsWith('var(')) {
			const temp = document.createElement('div');
			temp.style.color = color;
			document.body.appendChild(temp);
			const resolved = getComputedStyle(temp).color;
			document.body.removeChild(temp);

			const rgbMatch = resolved.match(/\d+/g);
			if (rgbMatch && rgbMatch.length >= 3) {
				return "#" + ((1 << 24) + (parseInt(rgbMatch[0]) << 16) + (parseInt(rgbMatch[1]) << 8) + parseInt(rgbMatch[2])).toString(16).slice(1);
			}
		}
		return color.startsWith('#') ? color : '#000000';
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Arabic font size')
			.setDesc('Adjust the size of the Arabic text in the verse card.')
			.addSlider(slider => {
				const currentVal = parseFloat(this.plugin.settings.fontSize) || 2.0;
				slider
					.setLimits(1, 5, 0.1)
					.setValue(currentVal)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.fontSize = `${value}rem`;
						await this.plugin.saveSettings();
					});
			});

		// Background Color Setting
		new Setting(containerEl)
			.setName('Background color')
			.setDesc('Choose a custom background color for the verse card.')
			.addExtraButton(button => button
				.setIcon('reset')
				.setTooltip('Reset to default background')
				.onClick(async () => {
					this.plugin.settings.backgroundColor = DEFAULT_SETTINGS.backgroundColor;
					await this.plugin.saveSettings();
					this.display();
				}))
			.addColorPicker(color => color
				.setValue(this.resolveColor(this.plugin.settings.backgroundColor))
				.onChange(async (value) => {
					this.plugin.settings.backgroundColor = value;
					await this.plugin.saveSettings();
				}));

		// Accent Color Setting
		new Setting(containerEl)
			.setName('Accent color')
			.setDesc('Choose a custom accent color for the left border.')
			.addExtraButton(button => button
				.setIcon('reset')
				.setTooltip('Reset to default accent color')
				.onClick(async () => {
					this.plugin.settings.accentColor = DEFAULT_SETTINGS.accentColor;
					await this.plugin.saveSettings();
					this.display();
				}))
			.addColorPicker(color => color
				.setValue(this.resolveColor(this.plugin.settings.accentColor))
				.onChange(async (value) => {
					this.plugin.settings.accentColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Translation language')
			.setDesc('Select the language for the verse translation.')
			.addDropdown(dropdown => {
				if (this.languages.length > 0) {
					const options: Record<string, string> = {};
					this.languages.forEach(l => options[l.code] = l.name);
					dropdown
						.addOptions(options)
						.setValue(this.plugin.settings.language)
						.onChange(async (val) => {
							this.plugin.settings.language = val;
							this.editions = [];
							try {
								const edRes = await requestUrl(`https://api.alquran.cloud/v1/edition/language/${val}`);
								const edJson = edRes.json as EditionResponse;
								if (edJson && edJson.data) {
									const filtered = edJson.data.filter((edition: Edition) => edition.format === 'text' && edition.type === 'translation');
									if (filtered && filtered.length > 0) {
										this.plugin.settings.translation = filtered[0].identifier;
									}
								}
							} catch (error) {
								console.error("Quran Plugin: Auto-edition failed", error);
							}
							await this.plugin.saveSettings();
							await this.fetchMetadata();
						});
				} else {
					dropdown.addOption('loading', 'Loading languages...');
					dropdown.setDisabled(true);
				}
			});

		new Setting(containerEl)
			.setName('Translation edition')
			.setDesc('Select a specific translation source.')
			.addDropdown(dropdown => {
				if (this.editions.length > 0) {
					const options: Record<string, string> = {};
					this.editions.forEach(e => options[e.identifier] = e.name);
					dropdown
						.addOptions(options)
						.setValue(this.plugin.settings.translation)
						.onChange(async (val) => {
							this.plugin.settings.translation = val;
							await this.plugin.saveSettings();
						});
				} else {
					dropdown.addOption('loading', 'Loading editions...');
					dropdown.setDisabled(true);
				}
			});

		if (this.languages.length === 0) {
			void this.fetchMetadata();
		}
	}
}
