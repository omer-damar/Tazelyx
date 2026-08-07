class UnsupportedStoreError extends Error {
  constructor(store) {
    super(`"${store}" marketi için fiş ayrıştırma desteği henüz eklenmedi.`);
    this.name = "UnsupportedStoreError";
    this.store = store;
  }
}

module.exports = { UnsupportedStoreError };
