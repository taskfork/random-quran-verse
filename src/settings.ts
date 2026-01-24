import { App, PluginSettingTab, Setting, requestUrl, Notice } from 'obsidian';
import QuranPlugin from './main';

// region: --- Interfaces ---

export interface QuranSettings {
	translation: string;
	language: string;
	fontSize: string;
	backgroundColor: string;
	accentColor: string;
	tafsir: string;
	tafsirName: string;
    tafsirLanguage: string;
	font: string;
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

interface CdnTafsirEdition {
	author_name: string;
	id: number;
	language_name: string;
	name: string;
	slug: string;
	source: string;
}

// endregion

// region: --- Type Guards ---

function isLanguageResponse(data: unknown): data is LanguageResponse {
    const d = data as LanguageResponse;
    return (
        typeof d === 'object' && d !== null &&
        typeof d.code === 'number' &&
        typeof d.status === 'string' &&
        Array.isArray(d.data) &&
        d.data.every((item: unknown) => typeof item === 'string')
    );
}

function isEdition(data: unknown): data is Edition {
    const d = data as Edition;
    return (
        typeof d === 'object' && d !== null &&
        typeof d.identifier === 'string' &&
        typeof d.language === 'string' &&
        typeof d.name === 'string' &&
        typeof d.englishName === 'string' &&
        typeof d.format === 'string' &&
        typeof d.type === 'string' &&
        (typeof d.direction === 'string' || d.direction === null)
    );
}

function isEditionResponse(data: unknown): data is EditionResponse {
    const d = data as EditionResponse;
    return (
        typeof d === 'object' && d !== null &&
        typeof d.code === 'number' &&
        typeof d.status === 'string' &&
        Array.isArray(d.data) &&
        d.data.every(isEdition)
    );
}

function isCdnTafsirEdition(data: unknown): data is CdnTafsirEdition {
    const d = data as CdnTafsirEdition;
    return (
        typeof d === 'object' && d !== null &&
        typeof d.author_name === 'string' &&
        typeof d.id === 'number' &&
        typeof d.language_name === 'string' &&
        typeof d.name === 'string' &&
        typeof d.slug === 'string' &&
        typeof d.source === 'string'
    );
}

function isCdnTafsirEditionArray(data: unknown): data is CdnTafsirEdition[] {
    return Array.isArray(data) && data.every(isCdnTafsirEdition);
}

// endregion

export const DEFAULT_SETTINGS: QuranSettings = {
	translation: 'en.itani',
	language: 'en',
	fontSize: '2.0rem',
	backgroundColor: 'var(--background-secondary)',
	accentColor: 'var(--interactive-accent)',
	tafsir: 'en-tafisr-ibn-kathir',
	tafsirName: 'Tafsir Ibn Kathir (Abridged)',
	tafsirLanguage: 'en',
	font: '"Noto Naskh Arabic"'
};

export class QuranSettingTab extends PluginSettingTab {
	plugin: QuranPlugin;
	languages: { code: string, name: string }[] = [];
	tafsirLanguages: { code: string, name: string }[] = [];
	editions: Edition[] = [];
	tafsirEditions: Edition[] = [];
	isLoadingMetadata = false;

	constructor(app: App, plugin: QuranPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async fetchMetadata() {
		if (this.isLoadingMetadata) return;
		this.isLoadingMetadata = true;

		try {
			await this.fetchLanguages();
			await this.fetchTranslationEditions();
			await this.fetchAndProcessTafsirs();
		} catch (error) {
			console.error('Quran plugin: An unexpected error occurred during metadata fetch:', error);
			new Notice('An unexpected error occurred. Please check the console for details.');
		} finally {
			this.isLoadingMetadata = false;
			this.display(); // Refresh the settings tab
		}
	}

	private async fetchLanguages(): Promise<void> {
		try {
			const langRes = await requestUrl('https://api.alquran.cloud/v1/edition/language');
			const langJson = langRes.json;

			if (isLanguageResponse(langJson) && langJson.data) {
				this.languages = langJson.data.map((lang: string) => ({
					code: lang,
					name: this.getFullLanguageName(lang)
				}));
				this.languages.sort((a, b) => a.name.localeCompare(b.name));
			} else {
				throw new Error("Invalid language response structure");
			}
		} catch (e) {
			console.error("Quran plugin: Failed to fetch languages.", e);
			new Notice("Failed to fetch languages. Check your internet connection.");
			throw e;
		}
	}

	private async fetchTranslationEditions(): Promise<void> {
		try {
			const translationEditionUrl = `https://api.alquran.cloud/v1/edition/language/${this.plugin.settings.language}`;
			const trRes = await requestUrl(translationEditionUrl);
			const trJson = trRes.json;

			if (isEditionResponse(trJson) && trJson.data) {
				this.editions = trJson.data.filter((e: Edition) => e.format === 'text' && e.type === 'translation');
			} else {
				throw new Error("Invalid translation edition response structure");
			}
		} catch (e) {
			console.error("Quran plugin: Failed to fetch translations.", e);
			new Notice("Failed to fetch translations. Check your internet connection.");
			throw e;
		}
	}

	private async fetchAndProcessTafsirs(): Promise<void> {
		try {
			const tafsirApiUrl = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/editions.json';
			const tafsirRes = await requestUrl(tafsirApiUrl);
			const tafsirJson = tafsirRes.json;

			if (!isCdnTafsirEditionArray(tafsirJson)) {
				throw new Error("Invalid Tafsir edition response structure");
			}
			
			// Populate tafsirLanguages dropdown
			const uniqueTafsirLanguages = Array.from(new Set(tafsirJson.map(t => t.language_name)));
			this.tafsirLanguages = uniqueTafsirLanguages.map(langName => {
				const code = this.languages.find(l => l.name.toLowerCase() === langName.toLowerCase())?.code || langName.toLowerCase();
				return { code: code, name: langName.charAt(0).toUpperCase() + langName.slice(1) };
			}).sort((a, b) => a.name.localeCompare(b.name));

			// Ensure selected tafsirLanguage is valid, default if not
			const currentTafsirLangCode = this.plugin.settings.tafsirLanguage;
			if (!this.tafsirLanguages.some(l => l.code === currentTafsirLangCode)) {
				this.plugin.settings.tafsirLanguage = this.tafsirLanguages.length > 0 ? this.tafsirLanguages[0]!.code : 'en';
				await this.plugin.saveSettings();
			}

			// Filter tafsirs by the *tafsirLanguage* setting
			this.tafsirEditions = tafsirJson
				.filter(t => t.language_name.toLowerCase() === this.getFullLanguageName(this.plugin.settings.tafsirLanguage).toLowerCase())
				.map(t => ({
					identifier: t.slug,
					language: t.language_name,
					name: t.name,
					englishName: t.author_name, // Using author_name as englishName for display
					format: 'text',
					type: 'tafsir',
					direction: null
				}));
			
			// Set default tafsir and its name if available
			if (this.tafsirEditions.length > 0) {
				if (!this.plugin.settings.tafsir || !this.tafsirEditions.some(t => t.identifier === this.plugin.settings.tafsir)) {
					this.plugin.settings.tafsir = this.tafsirEditions[0]!.identifier;
					this.plugin.settings.tafsirName = this.tafsirEditions[0]!.name;
					await this.plugin.saveSettings();
				} else {
					this.plugin.settings.tafsirName = this.tafsirEditions.find(t => t.identifier === this.plugin.settings.tafsir)?.name || this.plugin.settings.tafsir;
				}
			} else {
				this.plugin.settings.tafsir = '';
				this.plugin.settings.tafsirName = '';
				await this.plugin.saveSettings();
			}

		} catch (e) {
			console.error("Quran plugin: Failed to fetch or process Tafsir editions.", e);
			new Notice("Failed to fetch tafsir editions. Check your internet connection.");
			throw e;
		}
	}

	private getFullLanguageName(code: string): string {
		const customNames: Record<string, string> = {
			'ber': 'Berber',
			'ce': 'Chechen'
		};
		if (customNames[code.toLowerCase()]) {
			return customNames[code.toLowerCase()]!;
		}
		try {
			if (typeof Intl.DisplayNames === 'function') {
				const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
				return languageNames.of(code) || code;
			}
		} catch (e) {
			console.warn('Intl.DisplayNames failed for code:', code, e);
		}
		return code;
	}

	private resolveColor(color: string): string {
		if (color.startsWith('var(')) {
			const temp = document.createElement('div');
			temp.addClass('is-hidden');
			temp.style.color = color;
			document.body.appendChild(temp);
			const resolved = getComputedStyle(temp).color;

			document.body.removeChild(temp);
			const rgbMatch = resolved.match(/\d+/g);

			if (rgbMatch && rgbMatch.length >= 3) {
				const r = parseInt(rgbMatch[0] ?? "0");
				const g = parseInt(rgbMatch[1] ?? "0");
				const b = parseInt(rgbMatch[2] ?? "0");
				return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
			}
		}
		return color.startsWith('#') ? color : '#000000';
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Appearance')
			.setHeading();
		const fontPreviewEl = containerEl.createEl("div", {
											text: "بِسْمِ ٱللّٰهِ ٱلرَّحْمٰنِ ٱلرَّحِيمِ",
											attr: {
												style: `font-family: ${this.plugin.settings.font}; font-size: ${this.plugin.settings.fontSize}; text-align: center; margin: 1rem 0; padding: 1rem; border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m);`
											}
										});

		new Setting(containerEl)
			.setName("Verse preview")
			.setDesc("A preview of the font and size selections below.")
			.settingEl.appendChild(fontPreviewEl);

		new Setting(containerEl)
			.setName('Arabic font size')
			.setDesc('Adjust the size of the verse in the verse card.')
			.addExtraButton(button => button
				.setIcon('reset')
				.setTooltip('Reset to default font size')
				.onClick(async () => {
					this.plugin.settings.fontSize = DEFAULT_SETTINGS.fontSize;
					await this.plugin.saveSettings();
					fontPreviewEl.style.fontSize = DEFAULT_SETTINGS.fontSize;
					this.display();
				}))
			.addSlider(slider => {
				const currentVal = parseFloat(this.plugin.settings.fontSize) || 2.0;
				slider
					.setLimits(1, 5, 0.1)
					.setValue(currentVal)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.fontSize = `${value}rem`;
						await this.plugin.saveSettings();
						fontPreviewEl.style.fontSize = `${value}rem`;
					});
			});

		new Setting(containerEl)
			.setName('Arabic font')
			.setDesc('Select the font for the verse.')
			.addDropdown(dropdown => {
				dropdown
					.addOption('"Noto Naskh Arabic"', 'Noto Naskh Arabic')
					.addOption('"Amiri Quran"', 'Amiri Quran')
					.setValue(this.plugin.settings.font)
					.onChange(async (value) => {
						this.plugin.settings.font = value;
						await this.plugin.saveSettings();
						fontPreviewEl.style.fontFamily = value;
					});
			});

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
			.setName('Translation')
			.setHeading();

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
							this.editions = []; // Clear translations list, will be refetched
							
							try {
								await this.fetchTranslationEditions();
								if (this.editions.length > 0) {
									this.plugin.settings.translation = this.editions[0]!.identifier;
								}
							} catch (error) {
								console.error("Quran plugin: Auto-translation selection failed", error);
								new Notice("Failed to auto-select translation. Check your internet connection.");
							}
							
							await this.plugin.saveSettings();
							this.display(); // Re-render the whole tab to update the translation edition dropdown
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

		new Setting(containerEl)
			.setName('Tafsir/commentary')
			.setHeading();

		new Setting(containerEl)
			.setName('Tafsir language')
			.setDesc('Select the language for the tafsir/commentary.')
			.addDropdown(dropdown => {
				if (this.tafsirLanguages.length > 0) {
					const options: Record<string, string> = {};
					this.tafsirLanguages.forEach(l => options[l.code] = l.name);
					dropdown
						.addOptions(options)
						.setValue(this.plugin.settings.tafsirLanguage)
						.onChange(async (val) => {
							this.plugin.settings.tafsirLanguage = val;
							await this.plugin.saveSettings();
							await this.fetchAndProcessTafsirs(); // Re-fetch and process tafsirs for the new language
							this.display(); // Re-render to update tafsir edition dropdown
						});
				} else {
					dropdown.addOption('loading', 'Loading languages...');
					dropdown.setDisabled(true);
				}
			});

		new Setting(containerEl)
			.setName('Tafsir edition')
			.setDesc('Select a tafsir source.')
			.addDropdown(dropdown => {
				if (this.tafsirEditions.length > 0) {
					const options: Record<string, string> = {};
					this.tafsirEditions.forEach(e => options[e.identifier] = e.name);
					
					if (!this.plugin.settings.tafsir || !options[this.plugin.settings.tafsir]) {
						this.plugin.settings.tafsir = this.tafsirEditions[0]!.identifier;
						this.plugin.settings.tafsirName = this.tafsirEditions[0]!.name;
						void this.plugin.saveSettings();
					}

					dropdown
						.addOptions(options)
						.setValue(this.plugin.settings.tafsir)
						.onChange(async (val) => {
							this.plugin.settings.tafsir = val;
							this.plugin.settings.tafsirName = this.tafsirEditions.find(t => t.identifier === val)?.name || val;
							await this.plugin.saveSettings();
						});
				} else {
					dropdown.addOption('', 'No tafsirs available for this language');
					dropdown.setDisabled(true);
					
					if (this.plugin.settings.tafsir !== '') {
						this.plugin.settings.tafsir = '';
						this.plugin.settings.tafsirName = '';
						void this.plugin.saveSettings();
					}
				}
			});
		
		new Setting(containerEl)
			.setName('Attributions')
			.setHeading();
		
		new Setting(containerEl)
			.setName('Al Quran Cloud')
			.setDesc(createFragment(frag => {
				frag.appendText('API for Quranic data. ');
				frag.createEl('a', { text: 'https://alquran.cloud/', href: 'https://alquran.cloud/' });
			}));
		
		new Setting(containerEl)
			.setName('spa5k/tafsir_api')
			.setDesc(createFragment(frag => {
				frag.appendText('API for Tafsir (commentary) data. ');
				frag.createEl('a', { text: 'https://github.com/spa5k/tafsir_api', href: 'https://github.com/spa5k/tafsir_api' });
			}));
	}
}
