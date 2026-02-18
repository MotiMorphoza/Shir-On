/* ===================================================
   HUB.JS - Main System Controller
   Manages navigation, game loading, and state
=================================================== */

const Hub = {
  
  // State
  selectedLang: null,
  selectedGame: null,
  selectedFile: null,
  selectedPath: null,

  /* ===== INITIALIZATION ===== */
  init() {
    this.loadLanguages();
    this.attachEvents();
    this.checkFirstLaunch();
  },

  checkFirstLaunch() {
    if (!GameLib.storage.get('first_launch_done')) {
      // אפשר להוסיף tutorial או welcome screen
      GameLib.storage.set('first_launch_done', true);
    }
  },

  loadLanguages() {
    const select = document.getElementById('langSelect');
    if (!select || !window.HUB_INDEX) return;

    HUB_INDEX.languages.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.id;
      option.textContent = lang.title;
      select.appendChild(option);
    });
  },

  attachEvents() {
    // Language selection
    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
      langSelect.onchange = () => this.onLanguageSelect(langSelect.value);
    }

    // Game cards
    document.querySelectorAll('.game-card').forEach(card => {
      card.onclick = () => this.onGameSelect(card.dataset.game);
    });
  },

  /* ===== LANGUAGE SELECTION ===== */
  onLanguageSelect(lang) {
    this.selectedLang = lang;
    this.selectedGame = null;
    this.selectedFile = null;
    
    const gameCard = document.getElementById('gameSelectionCard');
    const topicCard = document.getElementById('topicSelectionCard');
    
    if (lang) {
      gameCard.style.display = 'block';
      topicCard.style.display = 'none';
      
      // Clear game selection
      document.querySelectorAll('.game-card').forEach(card => {
        card.classList.remove('selected');
      });
    } else {
      gameCard.style.display = 'none';
      topicCard.style.display = 'none';
    }
  },

  /* ===== GAME SELECTION ===== */
  onGameSelect(game) {
    if (!this.selectedLang) {
      alert('Please select a language first');
      return;
    }

    this.selectedGame = game;
    this.selectedFile = null;

    // Visual feedback
    document.querySelectorAll('.game-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.game === game);
    });

    // Build topic selection
    this.buildTopicSelection();
  },

  /* ===== TOPIC SELECTION ===== */
  buildTopicSelection() {
    const container = document.getElementById('accordions');
    const card = document.getElementById('topicSelectionCard');
    
    if (!container || !this.selectedLang) return;

    container.innerHTML = '';

    // קביעת קטגוריה לפי משחק
    const category = this.selectedGame === 'wordpuzzle' ? 'sentences' : null;
    
    // בניית מבנה נתונים לפי ענפים
    const structure = this.buildFileStructure(this.selectedLang, category);

    if (Object.keys(structure).length === 0) {
      container.innerHTML = '<p style="text-align:center;opacity:0.6;padding:20px;">No files available for this selection</p>';
      card.style.display = 'block';
      return;
    }

    // יצירת אקורדיון לכל ענף
    Object.keys(structure).forEach(branch => {
      const accordion = this.createAccordion(branch, structure[branch]);
      container.appendChild(accordion);
    });

    card.style.display = 'block';
  },

  buildFileStructure(lang, category) {
    const structure = {};

    HUB_INDEX.entries.forEach(entry => {
      // סינון לפי קטגוריה (אם צוין)
      if (category && entry.group !== category) return;
      
      // סינון לפי שפה
      if (!entry.files[lang]) return;

      const branch = entry.branch;
      const group = entry.group;

      if (!structure[branch]) {
        structure[branch] = {};
      }

      if (!structure[branch][group]) {
        structure[branch][group] = [];
      }

      entry.files[lang].forEach(file => {
        structure[branch][group].push({
          name: file.replace(/\.csv$/i, ''),
          file: file,
          path: `hub/${lang}/${branch}/${group}/${file}`
        });
      });
    });

    return structure;
  },

  createAccordion(branch, groups) {
    const accordion = document.createElement('div');
    accordion.className = 'accordion';

    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.innerHTML = `${branch} <span class="accordion-arrow">▶</span>`;
    header.onclick = () => accordion.classList.toggle('open');

    const content = document.createElement('div');
    content.className = 'accordion-content';

    Object.keys(groups).forEach(groupName => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'topic-group';
      
      const groupTitle = document.createElement('div');
      groupTitle.className = 'topic-group-title';
      groupTitle.textContent = groupName;
      groupDiv.appendChild(groupTitle);

      groups[groupName].forEach(fileData => {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'topic-file';
        fileDiv.textContent = fileData.name;
        fileDiv.onclick = (e) => {
          e.stopPropagation();
          this.onFileSelect(fileData);
        };
        groupDiv.appendChild(fileDiv);
      });

      content.appendChild(groupDiv);
    });

    accordion.appendChild(header);
    accordion.appendChild(content);

    return accordion;
  },

  /* ===== FILE SELECTION ===== */
  onFileSelect(fileData) {
    // Visual feedback
    document.querySelectorAll('.topic-file').forEach(f => {
      f.classList.remove('selected');
    });
    event.target.classList.add('selected');

    this.selectedFile = fileData.name;
    this.selectedPath = fileData.path;

    // הצגת כפתור התחלה
    this.showStartButton();
  },

  showStartButton() {
    // בדיקה אם כבר יש כפתור
    let startBtn = document.getElementById('dynamicStartBtn');
    
    if (!startBtn) {
      startBtn = document.createElement('button');
      startBtn.id = 'dynamicStartBtn';
      startBtn.className = 'btn-success mt-20';
      startBtn.innerHTML = '🚀 Start Session';
      startBtn.onclick = () => this.startGame();
      
      const topicCard = document.getElementById('topicSelectionCard');
      topicCard.appendChild(startBtn);
    }

    startBtn.style.display = 'block';
  },

  /* ===== START GAME ===== */
  async startGame() {
    if (!this.selectedGame || !this.selectedPath) {
      alert('Please select a game and topic');
      return;
    }

    try {
      // Loading state
      const btn = document.getElementById('dynamicStartBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Loading...';
      }

      // טעינת הקובץ
      const data = await GameLib.hub.loadFile(this.selectedPath);

      if (!data || data.length === 0) {
        throw new Error('No data found in file');
      }

      // הסתרת home screen
      document.getElementById('homeScreen').classList.remove('active');

      // הפעלת המשחק המתאים
      const context = {
        lang: this.selectedLang,
        file: this.selectedFile,
        path: this.selectedPath,
        data: data
      };

      switch (this.selectedGame) {
        case 'flashcards':
          Games.FlashCards.start(context);
          break;
        case 'wordmatch':
          Games.WordMatch.start(context);
          break;
        case 'wordpuzzle':
          Games.WordPuzzle.start(context);
          break;
      }

    } catch (error) {
      alert('Failed to load file: ' + error.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🚀 Start Session';
      }
    }
  },

  /* ===== NAVIGATION ===== */
  showHome() {
    // ניקוי game container
    document.getElementById('gameContainer').innerHTML = '';
    
    // הצגת home screen
    GameLib.ui.showScreen('homeScreen');
    
    // איפוס בחירות (אופציונלי)
    // this.selectedGame = null;
    // this.selectedFile = null;
  },

  exitGame() {
    if (confirm('Exit current session?')) {
      this.showHome();
    }
  },

  /* ===== STATISTICS ===== */
  showStats() {
    const content = document.getElementById('statsContent');
    if (!content) return;

    const sessions = GameLib.storage.get('all_sessions', []);
    
    if (sessions.length === 0) {
      content.innerHTML = '<p style="text-align:center;opacity:0.6;padding:40px;">No statistics yet. Play some games!</p>';
      GameLib.ui.showScreen('statsScreen');
      return;
    }

    // חישובי סטטיסטיקות
    const totalSessions = sessions.length;
    const totalTime = sessions.reduce((sum, s) => sum + s.time, 0);
    const avgTime = Math.round(totalTime / totalSessions);

    const byGame = {};
    sessions.forEach(s => {
      if (!byGame[s.game]) {
        byGame[s.game] = { count: 0, totalTime: 0 };
      }
      byGame[s.game].count++;
      byGame[s.game].totalTime += s.time;
    });

    let html = `
      <div class="stat-card">
        <div class="stat-title">Total Sessions</div>
        <div class="stat-value">${totalSessions}</div>
      </div>

      <div class="stat-card">
        <div class="stat-title">Total Learning Time</div>
        <div class="stat-value">${GameLib.ui.formatTime(totalTime)}</div>
      </div>

      <div class="stat-card">
        <div class="stat-title">Average Session</div>
        <div class="stat-value">${GameLib.ui.formatTime(avgTime)}</div>
      </div>

      <div class="stat-card">
        <div class="stat-title">By Game</div>
    `;

    Object.keys(byGame).forEach(game => {
      const data = byGame[game];
      const avg = Math.round(data.totalTime / data.count);
      html += `
        <div class="stat-row">
          <span>${game}</span>
          <span>${data.count} sessions · ${GameLib.ui.formatTime(avg)} avg</span>
        </div>
      `;
    });

    html += '</div>';

    // כפתור ניקוי
    html += `
      <button class="btn-danger mt-20" onclick="Hub.clearStats()">
        Clear All Statistics
      </button>
    `;

    content.innerHTML = html;
    GameLib.ui.showScreen('statsScreen');
  },

  clearStats() {
    if (confirm('Delete all statistics? This cannot be undone.')) {
      GameLib.storage.remove('all_sessions');
      this.showStats();
    }
  }

};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Hub.init());
} else {
  Hub.init();
}
