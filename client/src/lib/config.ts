// Geliştirme sırasında telefon (Expo Go) ile bilgisayar aynı Wi-Fi ağında
// olmalı; "localhost" telefondan bilgisayara değil telefonun kendisine
// işaret eder, bu yüzden bilgisayarın yerel ağ IP'sini kullanıyoruz. Wi-Fi
// ağı değişirse (ör. başka bir yerde çalışırken) burayı güncellemek yeterli.
export const API_BASE_URL = "http://172.20.10.2:4000/api";
