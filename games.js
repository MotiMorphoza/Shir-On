/* ===================================================
   GAMES.JS - All Game Modules
   FlashCards, WordMatch, WordPuzzle
=================================================== */

const Games = {

  /* =============================================
     FLASH CARDS GAME
  ============================================= */
  FlashCards: {
    session: [],
    current: 0,
    flipped: false,
    direction: 'forward', // forward או backward
    stats: { correct: 0, wrong: 0 },
    startTime: 0,
    timerInterval: null,
    context: null,

    start(context) {
      this.context = context;
      this.session = GameLib.ui.shuffle(context.data);
      this.current = 0;
      this.flipped = false;
      this.direction = 'forward';
      this.stats = { correct: 0, wrong: 0 };
      this.startTime = Date.now();
      
      this.render();
      this.loadCard();
      this.startTimer();
    },

    render() {
      const container = document.getElementById('gameContainer');
      container.innerHTML = `
        <div class="screen active" id="flashCardGame">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div id="fcTimer" style="font-size: 18px;">⏱ 0:00</div>
            <div id="fcProgress" style="font-size: 18px;">0 / ${this.session.length}</div>
          </div>

          <div class="card" style="background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 30px; min-height: 200px; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-bottom: 20px;" onclick="Games.FlashCards.flip()">
            <div id="fcCardText" style="font-size: 36px; font-weight: 800; text-align: center; line-height: 1.3;"></div>
          </div>

          <div style="text-align: center; margin-bottom: 20px; font-size: 24px; opacity: 0.7;">
            👆 Click to flip
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <button class="btn-success" onclick="Games.FlashCards.markKnown()">✓ I knew it</button>
            <button class="btn-danger" onclick="Games.FlashCards.markUnknown()">✗ I didn't</button>
          </div>

          <button class="btn-primary" onclick="Games.FlashCards.flipDirection()" style="margin-bottom: 12px;">
            🔄 Flip Direction
          </button>

          <button class="btn-secondary" onclick="Hub.exitGame()">Exit Session</button>
        </div>
      `;
    },

    loadCard() {
      if (this.current >= this.session.length) {
        this.endSession();
        return;
      }

      this.flipped = false;
      this.updateCard();
      this.updateProgress();
    },

    updateCard() {
      const card = this.session[this.current];
      const textEl = document.getElementById('fcCardText');
      
      if (!textEl || !card) return;

      const showText = this.flipped 
        ? (this.direction === 'forward' ? card.target : card.source)
        : (this.direction === 'forward' ? card.source : card.target);

      textEl.textContent = showText;
      GameLib.ui.setDirection(textEl, showText);
    },

    updateProgress() {
      const progress = document.getElementById('fcProgress');
      if (progress) {
        progress.textContent = `${this.current + 1} / ${this.session.length}`;
      }
    },

    flip() {
      this.flipped = !this.flipped;
      GameLib.audio.play('flip');
      this.updateCard();
    },

    flipDirection() {
      this.direction = this.direction === 'forward' ? 'backward' : 'forward';
      this.flipped = false;
      this.updateCard();
    },

    markKnown() {
      GameLib.audio.play('success');
      this.stats.correct++;
      this.current++;
      this.loadCard();
    },

    markUnknown() {
      GameLib.audio.play('error');
      this.stats.wrong++;
      this.session.push(this.session[this.current]); // חזרה על הכרטיס
      this.current++;
      this.loadCard();
    },

    startTimer() {
      this.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const timerEl = document.getElementById('fcTimer');
        if (timerEl) {
          timerEl.textContent = `⏱ ${GameLib.ui.formatTime(elapsed)}`;
        }
      }, 1000);
    },

    endSession() {
      clearInterval(this.timerInterval);
      
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      
      // שמירת סטטיסטיקות
      GameLib.storage.addGameSession(
        'flashcards',
        this.context.lang,
        this.context.file,
        elapsed,
        this.stats.wrong
      );

      const container = document.getElementById('gameContainer');
      container.innerHTML = `
        <div class="screen active" style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 80px; margin-bottom: 20px;">🎉</div>
          <h2 style="font-size: 32px; margin-bottom: 20px;">Session Complete!</h2>
          
          <div class="card" style="margin-bottom: 20px;">
            <div class="stat-row"><span>Time:</span><span>${GameLib.ui.formatTime(elapsed)}</span></div>
            <div class="stat-row"><span>Correct:</span><span>${this.stats.correct}</span></div>
            <div class="stat-row"><span>Wrong:</span><span>${this.stats.wrong}</span></div>
            <div class="stat-row"><span>Accuracy:</span><span>${Math.round(this.stats.correct / (this.stats.correct + this.stats.wrong) * 100)}%</span></div>
          </div>

          <button class="btn-success" onclick="Games.FlashCards.start(Games.FlashCards.context)" style="margin-bottom: 12px;">
            Restart Session
          </button>
          <button class="btn-secondary" onclick="Hub.showHome()">Back to Home</button>
        </div>
      `;
    }
  },

  /* =============================================
     WORD MATCH GAME
  ============================================= */
  WordMatch: {
    queue: [],
    activePairs: [],
    selectedLeft: null,
    selectedRight: null,
    locked: false,
    remaining: 0,
    errors: 0,
    startTime: 0,
    timerInterval: null,
    context: null,
    MAX_VISIBLE: 6,

    start(context) {
      this.context = context;
      this.queue = GameLib.ui.shuffle(context.data);
      this.remaining = this.queue.length;
      this.errors = 0;
      this.locked = false;
      this.selectedLeft = null;
      this.selectedRight = null;
      this.startTime = Date.now();

      // טעינת הזוגות הראשונים
      const visible = Math.min(this.MAX_VISIBLE, this.queue.length);
      this.activePairs = this.queue.slice(0, visible);
      this.queue = this.queue.slice(visible);

      this.render();
      this.renderBoard();
      this.startTimer();
    },

    render() {
      const container = document.getElementById('gameContainer');
      container.innerHTML = `
        <div class="screen active" id="wordMatchGame">
          <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 18px;">
            <div id="wmTimer">⏱ 0:00</div>
            <div id="wmRemaining">🔢 ${this.remaining}</div>
          </div>

          <div class="card" style="padding: 15px; margin-bottom: 15px;">
            <div style="text-align: center; font-size: 22px; font-weight: 800; margin-bottom: 10px;">
              Match the pairs
            </div>
            <div id="wmBoard" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; min-height: 300px;"></div>
          </div>

          <button class="btn-secondary" onclick="Hub.exitGame()">Exit Session</button>
        </div>
      `;
    },

    renderBoard() {
      const board = document.getElementById('wmBoard');
      if (!board) return;

      board.innerHTML = '';

      const leftWords = GameLib.ui.shuffle(this.activePairs.map(p => p.source));
      const rightWords = GameLib.ui.shuffle(this.activePairs.map(p => p.target));

      leftWords.forEach(word => {
        board.appendChild(this.createCard('left', word));
      });

      rightWords.forEach(word => {
        board.appendChild(this.createCard('right', word));
      });
    },

    createCard(side, text) {
      const card = document.createElement('div');
      card.className = 'word';
      card.textContent = text;
      card.style.cssText = `
        padding: 14px;
        border-radius: 12px;
        background: linear-gradient(135deg, var(--accent-peach), #ffcdb2);
        color: #5a1f14;
        font-weight: 700;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `;

      GameLib.ui.setDirection(card, text);

      card.onclick = () => this.selectCard(side, text, card);

      return card;
    },

    selectCard(side, text, element) {
      if (this.locked) return;

      GameLib.audio.play('click');

      if (side === 'left') {
        // ביטול בחירה אם לוחצים על אותה קלף
        if (this.selectedLeft === text) {
          this.selectedLeft = null;
          element.style.outline = 'none';
          return;
        }

        // ניקוי בחירה קודמת
        document.querySelectorAll('.word').forEach(c => {
          if (c.textContent === this.selectedLeft) c.style.outline = 'none';
        });

        this.selectedLeft = text;
        element.style.outline = '3px solid var(--accent-blue)';
      } else {
        if (this.selectedRight === text) {
          this.selectedRight = null;
          element.style.outline = 'none';
          return;
        }

        document.querySelectorAll('.word').forEach(c => {
          if (c.textContent === this.selectedRight) c.style.outline = 'none';
        });

        this.selectedRight = text;
        element.style.outline = '3px solid var(--accent-blue)';
      }

      // בדיקה אם בחרו שני קלפים
      if (this.selectedLeft && this.selectedRight) {
        this.locked = true;
        setTimeout(() => this.checkMatch(), 300);
      }
    },

    checkMatch() {
      const match = this.activePairs.find(p => 
        p.source === this.selectedLeft && p.target === this.selectedRight
      );

      if (match) {
        GameLib.audio.play('success');
        this.handleMatch(match);
      } else {
        GameLib.audio.play('error');
        this.errors++;
        this.resetSelection();
      }
    },

    handleMatch(pair) {
      this.remaining--;
      this.activePairs = this.activePairs.filter(p => p !== pair);

      // הוספת זוג חדש מהתור
      if (this.queue.length > 0 && this.remaining > this.MAX_VISIBLE) {
        this.activePairs.push(this.queue.shift());
      }

      document.getElementById('wmRemaining').textContent = `🔢 ${this.remaining}`;

      setTimeout(() => {
        this.resetSelection();
        
        if (this.remaining === 0 || this.activePairs.length === 0) {
          this.endSession();
        } else {
          this.renderBoard();
        }
      }, 400);
    },

    resetSelection() {
      this.selectedLeft = null;
      this.selectedRight = null;
      this.locked = false;
      
      document.querySelectorAll('.word').forEach(c => {
        c.style.outline = 'none';
      });
    },

    startTimer() {
      this.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const timerEl = document.getElementById('wmTimer');
        if (timerEl) {
          timerEl.textContent = `⏱ ${GameLib.ui.formatTime(elapsed)}`;
        }
      }, 1000);
    },

    endSession() {
      clearInterval(this.timerInterval);
      
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const isBest = GameLib.storage.setBestTime('wordmatch', this.context.path, elapsed);
      const bestTime = GameLib.storage.getBestTime('wordmatch', this.context.path);

      GameLib.storage.addGameSession(
        'wordmatch',
        this.context.lang,
        this.context.file,
        elapsed,
        this.errors
      );

      const container = document.getElementById('gameContainer');
      container.innerHTML = `
        <div class="screen active" style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 80px; margin-bottom: 20px;">🎉</div>
          <h2 style="font-size: 32px; margin-bottom: 20px;">Complete!</h2>
          
          <div class="card" style="margin-bottom: 20px;">
            <div class="stat-row"><span>Time:</span><span>${GameLib.ui.formatTime(elapsed)} ${isBest ? '🏆' : ''}</span></div>
            <div class="stat-row"><span>Errors:</span><span>${this.errors}</span></div>
            <div class="stat-row"><span>Best Time:</span><span>${GameLib.ui.formatTime(bestTime)}</span></div>
          </div>

          <button class="btn-success" onclick="Games.WordMatch.start(Games.WordMatch.context)" style="margin-bottom: 12px;">
            Restart
          </button>
          <button class="btn-secondary" onclick="Hub.showHome()">Back to Home</button>
        </div>
      `;
    }
  },

  /* =============================================
     WORD PUZZLE GAME
  ============================================= */
  WordPuzzle: {
    sentences: [],
    current: 0,
    sourceTokens: [],
    bankTokens: [],
    builtTokens: [],
    wrongAttempts: 0,
    allWrongCounted: false,
    startTime: 0,
    timerInterval: null,
    context: null,

    start(context) {
      this.context = context;
      
      // ודא שיש משפטים
      if (!context.data || context.data.length === 0) {
        alert('No sentences found in this file');
        Hub.showHome();
        return;
      }

      this.sentences = GameLib.ui.shuffle(context.data);
      this.current = 0;
      this.startTime = Date.now();

      this.render();
      this.loadSentence();
      this.startTimer();
    },

    render() {
      const container = document.getElementById('gameContainer');
      container.innerHTML = `
        <div class="screen active" id="wordPuzzleGame">
          <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 18px;">
            <div id="wpTimer">⏱ 0:00</div>
            <div id="wpProgress">0 / ${this.sentences.length}</div>
          </div>

          <!-- Translation -->
          <div class="card" style="padding: 20px; margin-bottom: 15px;">
            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Translation:</div>
            <div id="wpTranslation" style="font-size: 20px; font-weight: 700; line-height: 1.4;"></div>
          </div>

          <!-- Built Sentence -->
          <div class="card" style="padding: 15px; margin-bottom: 15px;">
            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Build the sentence:</div>
            <div id="wpSentenceZone" style="min-height: 60px; background: var(--bg-elevated); border-radius: 10px; padding: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start;"></div>
          </div>

          <!-- Word Bank -->
          <div class="card" id="wpBankCard" style="padding: 15px; margin-bottom: 15px;">
            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Word bank:</div>
            <div id="wpBankZone" style="min-height: 80px; background: var(--bg-elevated); border-radius: 10px; padding: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start;"></div>
          </div>

          <!-- Speaker (hidden until correct) -->
          <div id="wpSpeaker" class="hidden" style="text-align: center; margin-bottom: 15px;">
            <div style="font-size: 48px; cursor: pointer;" onclick="Games.WordPuzzle.speak()">🔊</div>
            <div style="font-size: 14px; opacity: 0.7;">Listen</div>
          </div>

          <!-- Next Button -->
          <button id="wpNextBtn" class="btn-success" disabled onclick="Games.WordPuzzle.nextSentence()" style="margin-bottom: 12px;">
            Next ▶
          </button>

          <button class="btn-secondary" onclick="Hub.exitGame()">Exit Session</button>
        </div>
      `;
    },

    loadSentence() {
      if (this.current >= this.sentences.length) {
        this.endSession();
        return;
      }

      const sentence = this.sentences[this.current];
      
      // הצגת תרגום
      const translationEl = document.getElementById('wpTranslation');
      if (translationEl) {
        translationEl.textContent = sentence.target;
        GameLib.ui.setDirection(translationEl, sentence.target);
      }

      // פיצול המשפט למילים
      this.sourceTokens = sentence.source.trim().split(/\s+/).filter(Boolean);
      this.bankTokens = GameLib.ui.shuffle(
        this.sourceTokens.map((word, idx) => ({ id: `${idx}:${word}`, text: word }))
      );
      this.builtTokens = [];
      this.wrongAttempts = 0;
      this.allWrongCounted = false;

      // הסתרת speaker וכפתור next
      document.getElementById('wpSpeaker').classList.add('hidden');
      document.getElementById('wpNextBtn').disabled = true;
      document.getElementById('wpBankCard').style.display = 'block';

      // עדכון progress
      document.getElementById('wpProgress').textContent = `${this.current + 1} / ${this.sentences.length}`;

      this.renderTokens();
    },

    renderTokens() {
      const sentenceZone = document.getElementById('wpSentenceZone');
      const bankZone = document.getElementById('wpBankZone');

      if (!sentenceZone || !bankZone) return;

      sentenceZone.innerHTML = '';
      bankZone.innerHTML = '';

      // קביעת כיוון
      const isRTL = GameLib.ui.isRTL(this.sourceTokens[0] || '');
      sentenceZone.dir = isRTL ? 'rtl' : 'ltr';
      bankZone.dir = isRTL ? 'rtl' : 'ltr';

      // הצגת מילים במשפט הנבנה
      this.builtTokens.forEach(token => {
        sentenceZone.appendChild(this.createWordElement(token, true));
      });

      // הצגת מילים בבנק
      this.bankTokens.forEach(token => {
        bankZone.appendChild(this.createWordElement(token, false));
      });

      this.checkSentence();
    },

    createWordElement(token, inSentence) {
      const word = document.createElement('div');
      word.className = 'word';
      word.textContent = token.text;
      word.dataset.id = token.id;
      word.style.cssText = `
        padding: 10px 14px;
        border-radius: 10px;
        font-weight: 700;
        font-size: 16px;
        cursor: pointer;
        user-select: none;
        transition: all 0.15s;
        ${inSentence 
          ? 'background: linear-gradient(135deg, #dbeafe, #93c5fd); color: #072f63;' 
          : 'background: linear-gradient(135deg, var(--accent-peach), #ffcdb2); color: #5a1f14;'
        }
      `;

      word.onclick = () => this.moveToken(token.id, inSentence);

      return word;
    },

    moveToken(id, fromSentence) {
      GameLib.audio.play('click');

      if (fromSentence) {
        const idx = this.builtTokens.findIndex(t => t.id === id);
        if (idx >= 0) {
          this.bankTokens.push(this.builtTokens[idx]);
          this.builtTokens.splice(idx, 1);
        }
      } else {
        const idx = this.bankTokens.findIndex(t => t.id === id);
        if (idx >= 0) {
          this.builtTokens.push(this.bankTokens[idx]);
          this.bankTokens.splice(idx, 1);
        }
      }

      this.allWrongCounted = false;
      this.renderTokens();
    },

    checkSentence() {
      const built = this.builtTokens.map(t => t.text).join(' ');
      const target = this.sourceTokens.join(' ');
      const isCorrect = built === target;

      const nextBtn = document.getElementById('wpNextBtn');
      const bankCard = document.getElementById('wpBankCard');
      const speaker = document.getElementById('wpSpeaker');

      if (nextBtn) nextBtn.disabled = !isCorrect;
      if (bankCard) bankCard.style.display = isCorrect ? 'none' : 'block';
      if (speaker) speaker.classList.toggle('hidden', !isCorrect);

      // אם המשפט נבנה בצורה שגויה
      if (this.builtTokens.length === this.sourceTokens.length && !isCorrect && !this.allWrongCounted) {
        this.wrongAttempts++;
        this.allWrongCounted = true;
        GameLib.audio.play('error');

        // שמירת משפט קשה אחרי 2 ניסיונות כושלים
        if (this.wrongAttempts >= 2) {
          const sentence = this.sentences[this.current];
          GameLib.storage.addHardSentence(this.context.path, {
            source: sentence.source,
            target: sentence.target
          });
        }
      }

      // אם נכון
      if (isCorrect && !nextBtn.disabled) {
        GameLib.audio.play('success');
      }
    },

    nextSentence() {
      this.current++;
      this.loadSentence();
    },

    speak() {
      const text = this.sourceTokens.join(' ');
      const langCode = this.getLangCode(this.context.lang);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langCode;
      utterance.rate = 0.9;

      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    },

    getLangCode(langPair) {
      const first = langPair.split('-')[0];
      const map = {
        'he': 'he-IL',
        'en': 'en-US',
        'ar': 'ar-SA',
        'es': 'es-ES',
        'pl': 'pl-PL'
      };
      return map[first] || 'en-US';
    },

    startTimer() {
      this.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        const timerEl = document.getElementById('wpTimer');
        if (timerEl) {
          timerEl.textContent = `⏱ ${GameLib.ui.formatTime(elapsed)}`;
        }
      }, 1000);
    },

    endSession() {
      clearInterval(this.timerInterval);
      
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      const isBest = GameLib.storage.setBestTime('wordpuzzle', this.context.path, elapsed);
      const bestTime = GameLib.storage.getBestTime('wordpuzzle', this.context.path);

      GameLib.storage.addGameSession(
        'wordpuzzle',
        this.context.lang,
        this.context.file,
        elapsed
      );

      const container = document.getElementById('gameContainer');
      container.innerHTML = `
        <div class="screen active" style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 80px; margin-bottom: 20px;">🎉</div>
          <h2 style="font-size: 32px; margin-bottom: 20px;">Session Complete!</h2>
          
          <div class="card" style="margin-bottom: 20px;">
            <div class="stat-row"><span>Time:</span><span>${GameLib.ui.formatTime(elapsed)} ${isBest ? '🏆' : ''}</span></div>
            <div class="stat-row"><span>Best Time:</span><span>${GameLib.ui.formatTime(bestTime)}</span></div>
          </div>

          <button class="btn-success" onclick="Games.WordPuzzle.start(Games.WordPuzzle.context)" style="margin-bottom: 12px;">
            Restart
          </button>
          <button class="btn-secondary" onclick="Hub.showHome()">Back to Home</button>
        </div>
      `;
    }
  }

};
