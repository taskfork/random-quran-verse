import "../styles.css";
import { App, MarkdownRenderChild, Modal, Notice, Plugin, requestUrl, setIcon } from 'obsidian';
import { DEFAULT_SETTINGS, QuranSettingTab, QuranSettings } from './settings';

interface AyahData {
	number: number;
	text: string;
	numberInSurah: number;
	surah: {
		number: number;
		name: string;
		englishName: string;
	};
	edition: {
		identifier: string;
		language: string;
		name: string;
		direction: string | null;
	};
}

interface ApiResponse {
	code: number;
	status: string;
	data: AyahData;
}

// New interfaces for spa5k/tafsir_api response (CDN version)
interface CdnTafsirAyah {
    ayah: number;
    surah: number;
    text: string;
}
interface CdnTafsirSurahResponse {
    ayahs: CdnTafsirAyah[];
}

class TafsirModal extends Modal {
    constructor(app: App, private tafsirAyahData: CdnTafsirAyah, private tafsirName: string) {
        super(app);
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText(`Commentary - ${this.tafsirName}`);

        // Assuming LTR for English Tafsirs in the modal
        const isTafsirRtl = false;

        contentEl.createEl('p', {
            text: this.tafsirAyahData.text,
            attr: { dir: isTafsirRtl ? "rtl" : "ltr" },
            cls: isTafsirRtl ? "quran-rtl" : "quran-ltr"
        });

        // The surah name and number are not directly in CdnTafsirAyah,
        // so we'll just show Surah number and Ayah number from the data.
        contentEl.createEl('small', {
            text: `— Surah ${this.tafsirAyahData.surah}, Ayah ${this.tafsirAyahData.ayah}`,
            cls: 'quran-meta-modal'
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}


export default class QuranPlugin extends Plugin {
	settings: QuranSettings;

	async onload() {
		await this.loadSettings();
		this.applyGlobalStyles();

        // Instantiate settings tab first, then trigger its fetchMetadata
        const settingTab = new QuranSettingTab(this.app, this);
        this.addSettingTab(settingTab);
        await settingTab.fetchMetadata(); // Ensure metadata is loaded

		this.registerMarkdownCodeBlockProcessor("quran-verse", async (source, el, ctx) => {
			const renderVerse = async () => {
				el.empty();

				const container = el.createDiv({ cls: "quran-verse-card" });

				const headerEl = container.createDiv({ cls: "quran-header" });
				const headerIconEl = headerEl.createSpan({ cls: "quran-header-icon" });
				setIcon(headerIconEl, "book-open");
				headerEl.createDiv({ cls: "quran-header-title", text: "Holy Quran" });

				const skeletonArabic = container.createDiv({ cls: "quran-skeleton quran-skeleton-arabic" });
				const skeletonDivider = container.createDiv({ cls: "quran-skeleton-divider" });
				const skeletonEnglish = container.createDiv({ cls: "quran-skeleton quran-skeleton-english" });
				const skeletonMeta = container.createDiv({ cls: "quran-skeleton quran-skeleton-meta" });

				try {
					const randomRes = await requestUrl(`https://api.alquran.cloud/v1/ayah/${Math.floor(Math.random() * 6236) + 1}`);
					const randomJson = randomRes.json as ApiResponse;
					if (randomJson.code !== 200) throw new Error("Random API Error");

					const reference = randomJson.data.number;

					const [arRes, trRes] = await Promise.all([
						requestUrl(`https://api.alquran.cloud/v1/ayah/${reference}/quran-uthmani`),
						requestUrl(`https://api.alquran.cloud/v1/ayah/${reference}/${this.settings.translation}`)
					]);

					const arJson = arRes.json as ApiResponse;
					const trJson = trRes.json as ApiResponse;

					if (arJson.code !== 200 || trJson.code !== 200) throw new Error("Edition API Error");

					skeletonArabic.remove();
					skeletonDivider.remove();
					skeletonEnglish.remove();
					skeletonMeta.remove();

					const arData = arJson.data;
					const trData = trJson.data;

					const toArabicDigits = (num: number): string => {
						const digits = "٠١٢٣٤٥٦٧٨٩";
						return num.toString().replace(/\d/g, (d) => digits[parseInt(d)] ?? d);
					};

					const ayahNumberInArabic = toArabicDigits(arData.numberInSurah);

					const quranArabicDiv = container.createDiv({
						cls: "quran-arabic",
						attr: { dir: "rtl" }
					});
					quranArabicDiv.createSpan({ text: arData.text + ' ۝' + ayahNumberInArabic });

					const isTranslationRtl = trData.edition.direction === "rtl";

					container.createDiv({
						cls: isTranslationRtl ? "quran-translation quran-rtl" : "quran-translation quran-ltr",
						text: trData.text,
						attr: { dir: isTranslationRtl ? "rtl" : "ltr" }
					});

					const footerEl = container.createDiv({ cls: "quran-footer" });
					const actionsEl = footerEl.createDiv({ cls: "quran-actions" });

					footerEl.createDiv({
						cls: "quran-meta",
						text: `— ${trData.surah.englishName} (${trData.surah.number}), Ayah ${trData.numberInSurah}`
					});

					// Reload Button
					const reloadBtn = actionsEl.createEl("button", {
						cls: "quran-btn",
						attr: { "aria-label": "Reload verse" }
					});
					const reloadIconEl = reloadBtn.createSpan({ cls: "quran-icon" });
					setIcon(reloadIconEl, "refresh-cw");
					reloadBtn.addEventListener("click", (event) => {
						void renderVerse();
					});

					// Tafsir Button (moved and icon changed)
					const tafsirBtn = actionsEl.createEl("button", {
						cls: "quran-btn",
						attr: { "aria-label": "Show commentary" }
					});
					const tafsirIconEl = tafsirBtn.createSpan({ cls: "quran-icon" });
					setIcon(tafsirIconEl, "lightbulb"); // Changed icon

					tafsirBtn.addEventListener("click", (event) => {
						const handleClick = async () => {
							setIcon(tafsirIconEl, "loader");
							tafsirBtn.disabled = true;

							try {
								if (!this.settings.tafsir) {
									new Notice("No tafsir edition selected. Please select one in plugin settings.");
									return;
								}

								const surahNum = arData.surah.number;
								const ayahNum = arData.numberInSurah;

                                // Fetch the entire surah's tafsir from CDN
								const newTafsirApiUrl = `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${this.settings.tafsir}/${surahNum}.json`;
								const tafsirRes = await requestUrl(newTafsirApiUrl);
								const tafsirJson = tafsirRes.json as CdnTafsirSurahResponse;

								if (tafsirJson && tafsirJson.ayahs && Array.isArray(tafsirJson.ayahs)) {
                                    const targetAyahTafsir = tafsirJson.ayahs.find(a => a.ayah === ayahNum);

                                    if (targetAyahTafsir) {
                                        new TafsirModal(this.app, targetAyahTafsir, this.settings.tafsirName).open();
                                    } else {
                                        new Notice(`Tafsir not found for Ayah ${ayahNum} in Surah ${surahNum}.`);
                                    }
								} else {
									throw new Error("Tafsir API Error: Invalid response structure");
								}
							} catch (err) {
								console.error("Failed to fetch Tafsir:", err);
								new Notice("Failed to load commentary. Check if a valid tafsir edition is selected.");
							} finally {
								setIcon(tafsirIconEl, "lightbulb"); // Changed icon
								tafsirBtn.disabled = false;
							}
						};
						void handleClick();
					});

					// Link Button (original position)
					const linkBtn = actionsEl.createEl("button", {
						cls: "quran-btn",
						attr: { "aria-label": "Open in browser" }
					});
					const linkIconEl = linkBtn.createSpan({ cls: "quran-icon" });
					setIcon(linkIconEl, "link");
					linkBtn.addEventListener("click", (event) => {
						const surahNum = arData.surah.number;
						const ayahNum = arData.numberInSurah;
						window.open(`https://quran.com/${surahNum}/${ayahNum}`, "_blank");
					});

				} catch (err) {
					console.error("Quran Plugin Error:", err);

					const timeoutId = window.setTimeout(() => {
						if (container.isConnected) void renderVerse();
					}, 5000);

					const cleanup = new MarkdownRenderChild(el);
					cleanup.onunload = () => window.clearTimeout(timeoutId);
					ctx.addChild(cleanup);
				}
			};

			await renderVerse();
		});
	}

	applyGlobalStyles() {
		const { backgroundColor, accentColor, fontSize, font } = this.settings;
		const numericSize = parseFloat(fontSize);
		const lineHeight = `${numericSize * 1.6}rem`;

		document.body.style.setProperty('--quran-bg', backgroundColor);
		document.body.style.setProperty('--quran-accent', accentColor);
		document.body.style.setProperty('--quran-font-size', fontSize);
		document.body.style.setProperty('--quran-line-height', lineHeight);
		document.body.style.setProperty('--quran-font-family', font);
	}

	removeGlobalStyles() {
		document.body.style.removeProperty('--quran-bg');
		document.body.style.removeProperty('--quran-accent');
		document.body.style.removeProperty('--quran-font-size');
		document.body.style.removeProperty('--quran-line-height');
		document.body.style.removeProperty('--quran-font-family');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as QuranSettings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyGlobalStyles();
	}



	onunload() {
		this.removeGlobalStyles();
	}
}