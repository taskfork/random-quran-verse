import { Plugin, requestUrl, setIcon } from 'obsidian';
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
	private styleElement: HTMLStyleElement;

	async onload() {
		await this.loadSettings();

		// Initialize style element
		this.styleElement = document.createElement('style');
		this.styleElement.id = 'quran-plugin-dynamic-styles';
		document.head.appendChild(this.styleElement);

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
						return num.toString().replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
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
						attr: { "aria-label": "Reload Verse" }
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
						attr: { "aria-label": "Open in Al Quran" }
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

					ctx.addChild({
						onunload: () => window.clearTimeout(timeoutId)
					} as any);
				}
			};

			await renderVerse();
		});
	}

	applyGlobalStyles() {
		if (!this.styleElement) return;

		const bgColor = this.settings.backgroundColor;
		const accentColor = this.settings.accentColor;
		const fontSize = this.settings.fontSize;

		let resolvedTextColor;
		if (bgColor.includes('var(')) {
			resolvedTextColor = 'var(--text-normal)';
		} else {
			resolvedTextColor = this.getTextColor(bgColor);
		}

		const numericSize = parseFloat(fontSize);
		const lineHeight = `${numericSize * 1.6}rem`;

		this.styleElement.textContent = `
			body {
				--quran-bg: ${bgColor};
				--quran-text: ${resolvedTextColor};
				--quran-accent: ${accentColor};
				--quran-font-size: ${fontSize};
				--quran-line-height: ${lineHeight};
			}
		`.trim();
	}

	getTextColor(bgColor: string): string {
		if (!bgColor || bgColor.includes('var(')) {
			return 'var(--text-normal)';
		}

		try {
			const hexMatch = bgColor.match(/[0-9a-f]{3,6}/i);
			if (!hexMatch) return 'var(--text-normal)';

			const hex = hexMatch[0];
			let r, g, b;

			if (hex.length === 3) {
				r = parseInt(hex[0] + hex[0], 16);
				g = parseInt(hex[1] + hex[1], 16);
				b = parseInt(hex[2] + hex[2], 16);
			} else {
				r = parseInt(hex.substring(0, 2), 16);
				g = parseInt(hex.substring(2, 4), 16);
				b = parseInt(hex.substring(4, 6), 16);
			}

			const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
			return hsp > 127.5 ? '#111111' : '#ffffff';
		} catch {
			return 'var(--text-normal)';
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as QuranSettings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applyGlobalStyles();
	}

	onunload() {
		if (this.styleElement) {
			this.styleElement.remove();
		}
	}
}
