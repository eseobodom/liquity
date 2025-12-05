const year = new Date().getFullYear();
document.getElementById('date').textContent = year;

class Translator {
  constructor() {
    this.originalTexts = new Map();
    this.cache = new Map();
    this.currentLang = 'en';
    this.isTranslating = false;
    this.skipSelectors = ['script', 'style', 'noscript', 'iframe', 'canvas', 'svg'];
  }
  extractText() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.tagName.toLowerCase() === 'option') return NodeFilter.FILTER_REJECT;
          if (parent.closest('[data-no-translate]')) return NodeFilter.FILTER_REJECT;
        
          const text = node.textContent.trim();
          if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
          if (/^\d+$/.test(text)) return NodeFilter.FILTER_REJECT;
          
          if (/^(http|www\.|@)/i.test(text)) return NodeFilter.FILTER_REJECT;
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodes = [];
    let node;
    while (node = walker.nextNode()) {
      nodes.push(node);
    }

    nodes.forEach((node, index) => {
      const text = node.textContent.trim();
      if (text && !this.originalTexts.has(node)) {
        this.originalTexts.set(node, {
          id: `text_${index}`,
          original: text,
          parentTag: node.parentElement.tagName.toLowerCase()
        });
      }
    });
    
    console.log(`Found ${this.originalTexts.size} text nodes to translate`);
  }
  setLoading(show) {
    const loadingEl = document.getElementById('translationLoading');
    const selectEl = document.getElementById('languageSelect');
    
    if (loadingEl) loadingEl.style.display = show ? 'block' : 'none';
    if (selectEl) selectEl.disabled = show;
  }

  async translatePage(targetLang) {
    if (this.isTranslating || targetLang === this.currentLang) return;
    
    this.isTranslating = true;
    this.setLoading(true);
    
    try {
      if (targetLang === 'en') {
        await this.restoreOriginal();
      } else {
        await this.translateToLanguage(targetLang);
      }
      
      this.currentLang = targetLang;
      document.documentElement.lang = targetLang;
      localStorage.setItem('site_language', targetLang);
      
      console.log(`Successfully translated to ${targetLang}`);
      
    } catch (error) {
      console.error('Translation failed:', error);
    } finally {
      this.isTranslating = false;
      this.setLoading(false);
    }
  }
  async translateToLanguage(targetLang) {
    const nodes = Array.from(this.originalTexts.keys());
    const batchSize = 8;
    
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (node) => {
          const data = this.originalTexts.get(node);
          const translated = await this.getCachedTranslation(data.original, targetLang);
          
          if (translated && translated !== data.original) {
            node.textContent = translated;
          }
        })
      );
      
      if (i + batchSize < nodes.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }
  async getCachedTranslation(text, targetLang) {
    const cacheKey = `${text}_${targetLang}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const localStorageKey = `translation_${cacheKey}`;
    const cached = localStorage.getItem(localStorageKey);
    if (cached) {
      this.cache.set(cacheKey, cached);
      return cached;
    }
    
    try {
      const encodedText = encodeURIComponent(text);
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodedText}&langpair=en|${targetLang}`,
        {
          headers: { 'Accept': 'application/json' }
        }
      );
      
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      const data = await response.json();
      
      if (data.responseStatus !== 200 || !data.responseData?.translatedText) {
        console.warn(`Translation issue for: "${text}"`);
        return text;
      }
      
      let translated = data.responseData.translatedText;
      translated = translated.replace(/^"|"$/g, '').trim();
      this.cache.set(cacheKey, translated);
      localStorage.setItem(localStorageKey, translated);
      
      return translated;
      
    } catch (error) {
      console.warn(`Translation failed for "${text}":`, error);
      return text;
    }
  }
  async restoreOriginal() {
    this.originalTexts.forEach((data, node) => {
      node.textContent = data.original;
    });
  }
}
document.addEventListener('DOMContentLoaded', () => {
  const translator = new Translator();
  setTimeout(() => {
    translator.extractText();
  }, 500);
  
  const languageSelect = document.getElementById('languageSelect');
  
  const savedLang = localStorage.getItem('site_language') || 'en';
  if (savedLang && languageSelect.querySelector(`option[value="${savedLang}"]`)) {
    languageSelect.value = savedLang;
    document.documentElement.lang = savedLang;
  }
  
  if (savedLang !== 'en') {
    setTimeout(() => {
      translator.translatePage(savedLang);
    }, 1000);
  }
  
  languageSelect.addEventListener('change', async (e) => {
    const lang = e.target.value;
    await translator.translatePage(lang);
  });
  window.translator = translator;
});