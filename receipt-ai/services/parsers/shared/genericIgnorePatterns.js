// BİM, A101, Hakmar, File ve Happy Center fişleri karşılaştırılarak çıkarılmış,
// markadan bağımsız (jenerik) "bu satır ürün değil, fiş gürültüsü" kalıpları.
// Her market parser'ı bunlara ek olarak kendi marka adı gibi birkaç özel
// kalıp daha ekleyebilir (bkz. bimParser.js, a101Parser.js vb.).

const GENERIC_IGNORED_PATTERNS = [
  // Şirket unvanı satırları (Anonim Şirketi / Limited Şirketi eki)
  /A\.?\s?Ş\.?\s*$/i,
  /LTD\.?\s*Ş(Tİ|TI)\.?/i,

  // Adres bileşenleri (mahalle/cadde/sokak/bulvar, kısaltılmış hâlleriyle
  // birlikte: MAH/MH, CAD/CD, SOK/SK) ve "İLÇE / İL" satırları
  /\bMA?H\.?\b|\bCA?D\.?\b|\bSO?K\.?\b|\bBULVAR/i,
  /^[\wÇĞİÖŞÜçğıöşü]+\s*\/\s*[\wÇĞİÖŞÜçğıöşü0-9]+$/,
  // Posta kodu + şehir satırları ("34785 İSTANBUL" gibi)
  /^\d{4,5}\s+[A-ZÇĞİÖŞÜ]+$/i,

  // Poşet/torba ücreti — bir mutfak envanterinde ürün sayılmaz, market fişinde
  // gerçek bir kalem olsa da bilerek dışarıda bırakılıyor
  /^POS?ET\b|^TORBA\b/i,

  // "... Sanayi ve Ticaret A.Ş." gibi ticari unvan ekleri (çok yaygın)
  /SAN(AY(İ|I))?\.?\s*VE\s*T(İ|I)C(ARET)?/i,
  /TE(Ş|S)EKK(Ü|U)R\s*EDER/i,

  // Vergi/işletme kimlik bilgileri
  /\bV\.?D\.?B?\b|VERG(İ|I)\s*DA(İ|I)RES|MERS(İ|I)S/i,
  // "TCKN/VKN 11111111111 NİHAİ TÜKETİCİ" — vergi numarası vermeyen
  // müşteriler için HER Türkiye fişinde çıkan standart, markadan bağımsız
  // bir satır (sadece BİM'e özgü değil, bu yüzden jenerik listede).
  /TCKN\s*\/?\s*VKN|N(İ|I)HA(İ|I)\s*T(Ü|U)KET(İ|I)C(İ|I)/i,
  /M(Ü|U)KELLEF/i,
  /^ETTN/i,
  /^Belge\s*No/i,
  /^NO\s*:/i,
  /^TN[0-9a-z-]{8,}/i,
  /^Mgz\s*(Ad|Kod)/i,
  /E-AR(Ş|S)(İ|I)V|FATURA/i,
  /\bTEL\s*:/i,
  /^#.*#$/,
  /^V?ERS(İ|I)YON/i,

  // Tarih / saat / fiş no başlıkları
  /^TAR(İ|I)H\b/i,
  /^SAAT\b/i,
  // NOT: OCR bazen "FİŞ NO"yu "FTS NO" gibi yanlış okuyabiliyor; F ile
  // Ş/S arasında 0-2 karakterlik toleransla bunu da yakalıyoruz.
  /^F.{0,2}(Ş|S)\s*NO\b/i,
  /^\d{2}[.\/]\d{2}[.\/]\d{2,4}/,
  /^\d{1,2}:\d{2}(:\d{2})?$/,

  // Toplam / KDV satırları
  /^ARA\s*TOPLAM/i,
  /^TOPKDV/i,
  /^TOPLAM/i,
  /KDV\s*(ORAN|DAH(İ|I)L)/i,
  /^%\s?\d+/,

  // Ödeme / kart bilgileri
  /KRED(İ|I)\s*KART/i,
  /NAK(İ|I)T/i,
  /PE(Ş|S)(İ|I)N/i,
  /DEBIT\s*MASTERCARD|MASTERCARD|VISA\b/i,
  /AID\s*:/i,
  /APP\s*LABEL/i,
  /KART\s*NO\s*:/i,
  /K\.N\.?\s*:/i,
  /M(Ü|U)(Ş|S)TER(İ|I)\s*(İ|I)SM(İ|I)/i,
  /\*{4,}/,

  // Banka adları
  /GARANTI|BBVA|YAPIKRED(İ|I)|HALK\s*BANKASI|(İ|I)(Ş|S)\s*BANKASI|AKBANK|Z(İ|I)RAAT/i,

  // İşlem/terminal/onay/referans bilgileri
  /^SATI(Ş|S)\b/i,
  /ONAY\s*(KODU|NUMARASI|NO)/i,
  /REF\.?\s*NO/i,
  /(İ|I)(Ş|S)YER(İ|I)\s*(NO|ID)/i,
  /TERM(İNAL|INAL)?\.?\s*(NO|ID)/i,
  /BATCH\s*NO/i,
  /POS\s*(NO|:)/i,
  /(İ|I)(Ş|S)LEM\s*NO/i,
  /KAREKOD/i,
  /PROV(İ|I)ZYON\s*NO/i,
  /^TUTAR$/i,
  /^\*?\s*\d+[.,]\d+\s*TL$/i,
  /^\*?\d+[.,]\d+$/,

  // Fiş sonu kapanış/uyarı metinleri
  /KAR(Ş|S)ILI(Ğ|G)I\s*MAL|H(İ|I)ZMET\s*ALDIM/i,
  /TEMASSIZ/i,
  /GER(Ç|C)EKLE(Ş|S)T(İ|I)R(İ|I)LM(İ|I)(Ş|S)T(İ|I)R/i,
  /SAKLAYINIZ/i,
  /N[ÜUO]SHASIDIR|N[ÜUO]SHA/i,
  /KART\s*HAM(İ|I)L(İ|I)/i,

  // Kasa / kasiyer / fiş kapanış bilgileri
  /KAS(İ|I)YER/i,
  /^KASA\s*:/i,
  /SIRA\s*NO/i,
  /^Z\s*NO/i,
  // NOT: OCR "EKÜ NO"yu EKU/EKO/EKQ gibi farklı şekillerde okuyabiliyor;
  // EK ile NO arasındaki tek harfi serbest bırakıyoruz.
  /^EK[A-ZÇĞİÖŞÜ]\s*NO/i,
  // Yazarkasa/POS yazılım imza satırları ("MF YAC 21006726", "WF TY 10000083" gibi)
  /^[MW]F\s+[A-ZÇĞİÖŞÜ0-9]+\s+\d+/i,

  // Barkod / ürün kodu gibi tek başına uzun rakam dizileri
  /^\d{6,}$/,

  // POS/terminal kısa kodları (B:9072, S:2781, T:00350870 gibi) — BİM, Hakmar
  // ve File fişlerinin hepsinde aynı POS altyapısına ait olarak görüldü
  /\bB:\d+|\bS:\d+|\bT:\d+/,
];

const GENERIC_BLACKLIST_WORDS = [
  "BANKA",
  "KREDI",
  "KARTI",
  "GARANTI",
  "REF",
  "POS",
  "TNO",
  "KDV",
  "TOPLAM",
  "VD",
  "MERSIS",
  "ONAY",
  "ISYERI",
  "TERMINAL",
  "KASIYER",
  "BATCH",
  "FIS",
  "BELGE",
  "ETTN",
  "SATIS",
  "TUTAR",
  "NUSHA",
  "HAMILI",
  "BANKASI",
  "MASTERCARD",
  "VISA",
  "YAPIKREDI",
  "HALKBANK",
  "AKBANK",
  "ZIRAAT",
  "BBVA",
];

module.exports = { GENERIC_IGNORED_PATTERNS, GENERIC_BLACKLIST_WORDS };
