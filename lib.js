/* ===================================================
   LIB.JS - Shared Library
   All common utilities for the learning hub
=================================================== */

const GameLib = {

  /* ===== CSV PARSER ===== */
  parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    const result = [];

    lines.forEach(line => {
      const cells = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];

        if (char === '"') {
          if (inQuotes && next === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }

        if (char === ',' && !inQuotes) {
          cells.push(current.trim());
          current = '';
          continue;
        }

        current += char;
      }

      cells.push(current.trim());

      if (cells.length >= 2) {
        result.push({
          source: cells[0],
          target: cells[1]
        });
      }
    });

    return result;
  },

  /* ===== AUDIO ENGINE ===== */
  audio: {
    ctx: null,
    enabled: true,

    init() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    },

    play(type) {
      if (!this.enabled) return;
      this.init();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      // Sound profiles
      const profiles = {
        click: { freq: 420, wave: 'sine', vol: 0.02, dur: 0.15 },
        success: { freq: 720, wave: 'triangle', vol: 0.035, dur: 0.25 },
        error: { freq: 240, wave: 'sine', vol: 0.025, dur: 0.2 },
        flip: { freq: 520, wave: 'sine', vol: 0.02, dur: 0.18 }
      };

      const profile = profiles[type] || profiles.click;

      osc.type = profile.wave;
      osc.frequency.setValueAtTime(profile.freq, now);

      filter.type = 'lowpass';
      filter.frequency.value = 1200;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(profile.vol, now + 0.03);
      gain.gain.linearRampToValueAtTime(0, now + profile.dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + profile.dur + 0.05);
    },

    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    }
  },

  /* ===== STORAGE ===== */
  storage: {
    get(key, fallback = null) {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
      } catch {
        return fallback;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },

    remove(key) {
      localStorage.removeItem(key);
    },

    // Hard sentences management
    getHardSentences(source) {
      const key = `hard_sentences:${source}`;
      return this.get(key, []);
    },

    addHardSentence(source, item) {
      const hard = this.getHardSentences(source);
      const exists = hard.some(h => 
        h.source === item.source && h.target === item.target
      );
      if (!exists) {
        hard.push(item);
        this.set(`hard_sentences:${source}`, hard);
      }
    },

    removeHardSentence(source, index) {
      const hard = this.getHardSentences(source);
      hard.splice(index, 1);
      this.set(`hard_sentences:${source}`, hard);
    },

    // Statistics
    addGameSession(game, lang, topic, time, errors = 0) {
      const sessions = this.get('all_sessions', []);
      sessions.push({
        game,
        lang,
        topic,
        time,
        errors,
        date: Date.now()
      });
      this.set('all_sessions', sessions);
    },

    getBestTime(game, source) {
      const key = `best_time:${game}:${source}`;
      return this.get(key, 0);
    },

    setBestTime(game, source, time) {
      const key = `best_time:${game}:${source}`;
      const current = this.getBestTime(game, source);
      if (!current || time < current) {
        this.set(key, time);
        return true;
      }
      return false;
    }
  },

  /* ===== UI HELPERS ===== */
  ui: {
    shuffle(array) {
      const arr = array.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },

    isRTL(text) {
      return /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(text || '');
    },

    setDirection(element, text) {
      element.dir = this.isRTL(text) ? 'rtl' : 'ltr';
    },

    showScreen(id) {
      document.querySelectorAll('.screen').forEach(s => 
        s.classList.remove('active')
      );
      const screen = document.getElementById(id);
      if (screen) screen.classList.add('active');
    },

    formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
    }
  },

  /* ===== HUB INTERFACE ===== */
  hub: {
    async loadFile(path) {
      try {
        const response = await fetch(`${path}?v=${Date.now()}`);
        if (!response.ok) throw new Error('File not found');
        const text = await response.text();
        return GameLib.parseCSV(text);
      } catch (error) {
        console.error('Load error:', error);
        throw error;
      }
    },

    getFilesForLang(lang, category = null) {
      if (!window.HUB_INDEX) return [];
      
      const files = [];
      
      HUB_INDEX.entries.forEach(entry => {
        if (category && entry.group !== category) return;
        if (!entry.files[lang]) return;
        
        entry.files[lang].forEach(file => {
          files.push({
            branch: entry.branch,
            group: entry.group,
            file: file,
            path: `hub/${lang}/${entry.branch}/${entry.group}/${file}`,
            name: file
