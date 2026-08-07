/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Tazelyx marka renkleri (logo: yeşil-teal gradyan + lacivert).
        // İKİ TON KASITLI: "green" açık zeminlerdeki butonlar için (kullanıcı
        // özellikle koyu/doygun istemişti, dokunulmadı); "mint" ise koyu
        // zeminlerde (ör. tab bar dock'u) daha canlı bir aksan olarak
        // kullanılıyor — aynı yeşil-teal aileden ama farklı bağlamlar için.
        brand: {
          teal: "#14b8a6",
          // ÖNCEDEN #22c55e, sonra #0fae66'ydı — kullanıcı daha koyu/doygun bir yeşil istedi.
          green: "#047857",
          mint: "#19C7A3",
          navy: "#0C1624",
        },
        // Nötr metin/yüzey renkleri — ekranlar arasında tutarlı olsun diye
        // (önceden her ekran kendi slate-* Tailwind tonunu seçiyordu).
        ink: {
          DEFAULT: "#243041",
          muted: "#6E7A8D",
        },
        surface: "#F4F7F8",
        // Durum renkleri (rozet/uyarı renkleri tek yerden yönetilsin diye).
        status: {
          amber: "#D97706",
          critical: "#EF5A5A",
        },
      },
    },
  },
  plugins: [],
};
