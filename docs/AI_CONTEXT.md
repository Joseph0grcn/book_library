# Kitap Kütüphanem: AI Geliştirici Rehberi

Bu dosya, projeye sonradan katkı verecek yapay zekâ ve geliştiricilerin önce okuması gereken kısa teknik bağlamdır.

## Proje özeti

Kitap Kütüphanem, build adımı olmayan, tarayıcıda çalışan bir PWA'dır. Uygulama `index.html` ile açılır; ana davranış `js/main.js` içinden başlatılır. Veriler önce kullanıcıya ait `localStorage` anahtarında tutulur. Supabase oturumu varsa aynı kitaplar kullanıcının hesabına senkronize edilir.

## Dosya sorumlulukları

- `index.html`: Sayfa iskeleti, formlar, modallar ve CDN bağımlılıkları.
- `styles.css`: Açık/koyu tema, responsive yerleşim ve bileşen stilleri.
- `js/main.js`: Uygulama başlangıcı, auth, sayfa geçişleri, form, tarayıcı ve içe/dışa aktarma olayları.
- `js/core/storage.js`: Kitap normalizasyonu, localStorage, Supabase okuma/yazma ve bekleyen senkron kuyruğu.
- `js/core/config.js`: Storage anahtarları, kullanıcı bağlamı ve Supabase istemcisi.
- `js/ui/ui.js`: Kitap listesi, ayrıntı görünümü, kapak modalı, düzenleme modalı, istatistik ve tema yardımcıları.
- `js/ui/toast.js`: Uygulama içi bildirimler.
- `js/features/isbn.js`: ISBN doğrulama/dönüştürme, Google Books ve Open Library sorguları, yinelenen kitap kontrolü.
- `js/features/quotes.js`: Alıntıların yerel saklanması, basit Markdown gösterimi ve kopyalama/silme işlemleri.
- `js/features/badges.js`: Rozet koşulları ve rozet görünümü.
- `supabase-schema.sql`: `books` tablosu, RLS politikaları ve indeksler.
- `supabase-config.js`: Yalnızca frontend'de bulunabilecek Supabase URL/anon anahtarı ve isteğe bağlı Google Books anahtarı.
- `sw.js`: Uygulama kabuğu cache'i ve ağdan öncelikli PWA stratejisi.
- `netlify/functions/books.js`: Eski db.json endpoint'inin kapalı güvenlik stub'ı; veri kaynağı olarak kullanılmaz.

## Veri sözleşmesi

Bir kitap şu alanları kullanır: `id`, `title`, `author`, `year`, `tags`, `read`, `status`, `progress`, `rating`, `review`, `notes`, `shelf`, `startDate`, `finishDate`, `isbn`, `metadata`, `createdAt`.

`status` yalnızca `unread`, `reading` veya `read` olmalıdır. `progress` 0-100, `rating` 0-5 aralığındadır. Dışarıdan gelen ve eski kayıtlar her zaman `normalizeBook()` üzerinden geçirilmelidir. `metadata` sağlayıcıya göre değişir; Google Books alanları camelCase, Open Library alanları çoğunlukla snake_case kullanır.

## Senkronizasyon kuralları

Normal kayıt, düzenleme ve durum değişikliği Supabase'e upsert yapar; uzak kitapları silmez. Silme ve "Tümünü Sil" işlemleri özellikle `{ allowDelete: true }` seçeneğini vermelidir. Ağ yokken son kitap listesi kullanıcıya gösterilir ve bekleyen senkron localStorage'da tutulur.

## Geliştirme kuralları

1. Build sistemi yoktur; dosyalar tarayıcı ES modülleri olarak doğrudan çalışır.
2. Yeni kullanıcı verileri için kullanıcı anahtarı `getUserStorageKey()` ile oluşturulmalıdır.
3. API yanıtları eksik veya hatalı olabilir; alanlara erişmeden önce tip kontrolü yapın.
4. Kullanıcı metni DOM'a yazılırken `textContent` tercih edin. HTML üretmek gerekiyorsa mevcut escape yardımcılarını kullanın.
5. Kitap ayrıntısında kapak için `getBookCoverUrl()` kullanın; kapak yoksa ayrıntı sayfası yine çalışmalıdır.
6. CDN veya yeni ağ bağımlılığı eklenirse `sw.js` ve çevrimdışı davranışını güncelleyin.
7. Değişiklik sonrası `git diff --check`, ilgili dosya aramaları ve mümkünse gerçek tarayıcı testi yapılmalıdır.

## Bilinen çalışma sınırları

- Bu depo npm projesi değildir; `package.json` ve otomatik test runner yoktur.
- Kamera, OCR ve Google Books özellikleri ağ/tarayıcı izinlerine bağlıdır.
- `supabase-config.js` içindeki anahtar public anon anahtar olmalıdır; service-role anahtarı kesinlikle eklenmemelidir.
- Supabase tarafında şema değişirse önce `supabase-schema.sql` ve `storage.js` birlikte güncellenmelidir.

## Güvenli değişiklik akışı

Önce bu dosyayı ve ilgili modülü okuyun, sonra veri sözleşmesini bozmayacak küçük bir değişiklik yapın. Git geçmişindeki son commit'leri kontrol edin. Kullanıcı açıkça istemedikçe geçmişi yeniden yazmayın ve başka dosyalardaki kullanıcı değişikliklerini silmeyin.
