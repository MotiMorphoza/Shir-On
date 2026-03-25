export class BaseLyricsProvider {
  get name() {
    return 'base';
  }

  /**
   * @param {string} title
   * @param {string} artist
   * @returns {Promise<{lyrics_text: string, source: string, confidence_score: number} | null>}
   */
  async fetch(_title, _artist) {
    throw new Error(`${this.name}.fetch() not implemented`);
  }
}