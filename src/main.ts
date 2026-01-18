import { Plugin, requestUrl, setIcon, MarkdownRenderChild } from 'obsidian';
import { QuranSettings, DEFAULT_SETTINGS, QuranSettingTab } from './settings';

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

export default class QuranPlugin extends Plugin {
	settings: QuranSettings;

	async onload() {
		await this.loadSettings();
		this.applyGlobalStyles();
		this.addSettingTab(new QuranSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor("quran-verse", async (source, el, ctx) => {
			const renderVerse = async () => {
				el.empty();

				const container = el.createDiv({ cls: "quran-verse-card" });

				// Header Section
				const headerEl = container.createDiv({ cls: "quran-header" });
				const headerIconEl = headerEl.createSpan({ cls: "quran-header-icon" });
				setIcon(headerIconEl, "book-open");
				headerEl.createDiv({ cls: "quran-header-title", text: "Holy Quran" });

				// Render Skeleton Loading State
				const skeletonArabic = container.createDiv({ cls: "quran-skeleton quran-skeleton-arabic" });

				const skeletonDivider = container.createDiv({ cls: "quran-skeleton-divider" });
				skeletonDivider.setAttr("style", "border-bottom: 1px solid var(--background-modifier-border); width: 100%; height: 1px; margin-bottom: 0.5em;");

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

					// Success: Remove skeletons and divider
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

					const endOfAyahSymbol = "\u06DD";
					const fullArabicText = `${arData.text} ${endOfAyahSymbol}${toArabicDigits(arData.numberInSurah)}`;

					container.createDiv({
						cls: "quran-arabic",
						text: fullArabicText,
						attr: { dir: "rtl" }
					});

					const isTranslationRtl = trData.edition.direction === "rtl";

					const translationEl = container.createDiv({
						cls: "quran-english",
						text: trData.text,
						attr: { dir: isTranslationRtl ? "rtl" : "ltr" }
					});
					translationEl.style.textAlign = isTranslationRtl ? 'right' : 'left';

					// Footer Container
					const footerEl = container.createDiv({ cls: "quran-footer" });

					// Action buttons on the left
					const actionsEl = footerEl.createDiv({ cls: "quran-actions" });

					// Metadata on the right
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
					reloadBtn.addEventListener("click", (e) => {
						e.preventDefault();
						void renderVerse();
					});

					// Link Button
					const linkBtn = actionsEl.createEl("button", {
						cls: "quran-btn",
						attr: { "aria-label": "Open link" }
					});
					const linkIconEl = linkBtn.createSpan({ cls: "quran-icon" });
					setIcon(linkIconEl, "link");
					linkBtn.addEventListener("click", (e) => {
						e.preventDefault();
						const surahNum = arData.surah.number;
						const ayahNum = arData.numberInSurah;
						window.open(`https://alquran.cloud/surah/${surahNum}/${this.settings.translation}#${ayahNum}`, "_blank");
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
		const { backgroundColor, accentColor, fontSize } = this.settings;
		const numericSize = parseFloat(fontSize);
		const lineHeight = `${numericSize * 1.6}rem`;

		document.body.style.setProperty('--quran-bg', backgroundColor);
		document.body.style.setProperty('--quran-accent', accentColor);
		document.body.style.setProperty('--quran-font-size', fontSize);
		document.body.style.setProperty('--quran-line-height', lineHeight);
	}

	removeGlobalStyles() {
		document.body.style.removeProperty('--quran-bg');
		document.body.style.removeProperty('--quran-accent');
		document.body.style.removeProperty('--quran-font-size');
		document.body.style.removeProperty('--quran-line-height');
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
