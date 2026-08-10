// Route hata yanıtlarında kullanılan ortak yardımcı: hatayı sunucu
// tarafında logluyor ve istemciye SADECE geliştirme ortamında ham mesajı
// dönüyor. Production'da ham `error.message` istemciye sızarsa Mongo
// bağlantı bilgisi, dosya yolları, şema alan adları gibi iç detaylar
// gereksiz reconnaissance olarak dışarı çıkar — bu yüzden prod'da undefined
// dönülüyor, sadece `message` alanındaki kullanıcı dostu metin kalıyor.
function safeErrorDetail(error) {
  console.error(error);
  return process.env.NODE_ENV === "production" ? undefined : error.message;
}

module.exports = { safeErrorDetail };
