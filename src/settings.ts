import { App, PluginSettingTab, Setting, requestUrl, Notice } from 'obsidian';
import QuranPlugin from './main';

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

export const DEFAULT_SETTINGS: QuranSettings = {
	translation: 'en.itani',
	language: 'en',
	fontSize: '2.0rem',
	backgroundColor: 'var(--background-secondary)',
	accentColor: 'var(--interactive-accent)',
	tafsir: 'en-tafisr-ibn-kathir',
	    tafsirName: 'Tafsir Ibn Kathir (Abridged)',
	    tafsirLanguage: 'en',
	font: '"Noto Naskh Arabic"'}

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
	tafsirLanguages: { code: string, name: string }[] = []; // New property
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
			// Fetch languages from Al Quran Cloud (still used for translations)
			const langRes = await requestUrl('https://api.alquran.cloud/v1/edition/language').catch(e => {
                console.error("Quran plugin: Failed to fetch languages.", e);
                new Notice("Failed to fetch languages. Check your internet connection.");
                throw e; // Re-throw to propagate to outer catch
            });
			const langJson = langRes.json as LanguageResponse;
			if (langJson?.data) {
				this.languages = langJson.data.map((lang: string) => ({
					code: lang,
					name: this.getFullLanguageName(lang)
				}));
				this.languages.sort((a, b) => a.name.localeCompare(b.name));
			}
			// Fetch translations for the selected language from Al Quran Cloud
			const translationEditionUrl = `https://api.alquran.cloud/v1/edition/language/${this.plugin.settings.language}`;
			const trRes = await requestUrl(translationEditionUrl).catch(e => {
                console.error("Quran plugin: Failed to fetch translations.", e);
                new Notice("Failed to fetch translations. Check your internet connection.");
                throw e; // Re-throw
            });
			const trJson = trRes.json as EditionResponse;

			if (trJson?.data) {
				this.editions = trJson.data.filter((e: Edition) => e.format === 'text' && e.type === 'translation');
			}

			// Fetch Tafsir editions from spa5k/tafsir_api via CDN
			interface CdnTafsirEdition {
				author_name: string;
				id: number;
				language_name: string;
				name: string;
				slug: string;
				source: string;
			}
			const tafsirApiUrl = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/editions.json';
			const tafsirRes = await requestUrl(tafsirApiUrl).catch(e => {
                console.error("Quran plugin: Failed to fetch Tafsir editions.", e);
                new Notice("Failed to fetch Tafsir editions. Check your internet connection.");
                throw e; // Re-throw
            });
			const tafsirJson = tafsirRes.json as CdnTafsirEdition[];

			if (tafsirJson && Array.isArray(tafsirJson)) {
				// Populate tafsirLanguages dropdown
				const uniqueTafsirLanguages = Array.from(new Set(tafsirJson.map(t => t.language_name)));
				this.tafsirLanguages = uniqueTafsirLanguages.map(langName => {
					// Find the corresponding language code from the main languages list or use langName as code if not found
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
						direction: null // Direction not provided by this API, can be set later if needed
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
			}

			// This is the end of the if (fontJson) block
		} catch (error) {
			console.error('Quran plugin: An unexpected error occurred during metadata fetch:', error);
			new Notice('An unexpected error occurred. Please check the console for details.');
		} finally {
			this.isLoadingMetadata = false;
			this.display(); // Refresh the settings tab
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
			// Check if Intl.DisplayNames is supported
			if (typeof Intl.DisplayNames === 'function') {
				const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
				return languageNames.of(code) || code;
			}
		} catch (e) {
			// Fallback in case of an error with Intl.DisplayNames
			console.warn('Intl.DisplayNames failed for code:', code, e);
		}
		// Fallback for environments without Intl.DisplayNames or unsupported codes
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
															this.editions = []; // Clear translations list, will be refetched by fetchMetadata
															// No direct update to tafsirEditions based on translation language change
															try {
																const trRes = await requestUrl(`https://api.alquran.cloud/v1/edition/language/${val}`);
																const trJson = trRes.json as EditionResponse;
																if (trJson?.data) {
																	const filteredTranslations = trJson.data.filter(e => e.format === 'text' && e.type === 'translation');
																	if (filteredTranslations.length > 0) {
																		this.plugin.settings.translation = filteredTranslations[0]!.identifier;
																	}
																}
															} catch (error) {
																console.error("Quran plugin: Auto-translation selection failed", error);
																new Notice("Failed to auto-select translation. Check your internet connection.");
															}
															await this.plugin.saveSettings();
															await this.fetchMetadata(); // Re-fetch all metadata to update dropdowns
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
											.setDesc('Select the language for the Tafsir/commentary.')
											.addDropdown(dropdown => {
												if (this.tafsirLanguages.length > 0) { // Use tafsirLanguages
													const options: Record<string, string> = {};
													this.tafsirLanguages.forEach(l => options[l.code] = l.name);
													dropdown
														.addOptions(options)
														.setValue(this.plugin.settings.tafsirLanguage)
														.onChange(async (val) => {
															this.plugin.settings.tafsirLanguage = val;
															await this.plugin.saveSettings();
															await this.fetchMetadata(); // Re-fetch all metadata to update Tafsir edition dropdown
														});
												} else {
													dropdown.addOption('loading', 'Loading languages...');
													dropdown.setDisabled(true);
												}
											});

										// Tafsir edition dropdown (always visible)
										new Setting(containerEl)
											.setName('Tafsir edition')
											.setDesc('Select a specific Tafsir source.')
											.addDropdown(dropdown => {
												if (this.tafsirEditions.length > 0) {
													const options: Record<string, string> = {};
													this.tafsirEditions.forEach(e => options[e.identifier] = e.name);
													// Ensure the current tafsir setting is still valid, if not, default to the first available
													if (!this.plugin.settings.tafsir || !options[this.plugin.settings.tafsir]) {
														this.plugin.settings.tafsir = this.tafsirEditions[0]!.identifier;
														this.plugin.settings.tafsirName = this.tafsirEditions[0]!.name; // Set name too
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
													// Display message when no Tafsirs are available for the selected Tafsir language
													dropdown.addOption('', 'No Tafsirs available for this language');
													dropdown.setDisabled(true);
													// Also ensure the setting is cleared if no tafsirs are available
													if (this.plugin.settings.tafsir !== '') {
														this.plugin.settings.tafsir = '';
														this.plugin.settings.tafsirName = '';
														void this.plugin.saveSettings();
													}
												}
											});
	}
}
