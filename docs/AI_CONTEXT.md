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
- `tests/`: Node.js yerleşik testleri; ISBN ve kitap veri sözleşmesinin temel senaryoları.
- `scripts/check.mjs`: Build gerektirmeyen statik proje doğrulamaları.
- `package.json`, `eslint.config.js`, `.prettierrc.json`: Geliştirme komutları ve kalite kuralları.
- `supabase-schema.sql`: `books`, `profiles`, `friendships` ve `feed_posts` tabloları, RLS politikaları ve indeksler.
- `supabase-feed-migration.sql`: Mevcut verileri silmeden yalnızca `feed_posts` tablosunu ekleyen migration.
- `supabase-config.js`: Yalnızca frontend'de bulunabilecek Supabase URL/anon anahtarı ve isteğe bağlı Google Books anahtarı.
- `sw.js`: Uygulama kabuğu cache'i ve ağdan öncelikli PWA stratejisi.
- `netlify/functions/books.js`: Eski db.json endpoint'inin kapalı güvenlik stub'ı; veri kaynağı olarak kullanılmaz.

## Veri sözleşmesi

Bir kitap şu alanları kullanır: `id`, `title`, `author`, `year`, `tags`, `read`, `status`, `progress`, `rating`, `review`, `notes`, `shelf`, `startDate`, `finishDate`, `isbn`, `metadata`, `createdAt`.

`status` yalnızca `unread`, `reading` veya `read` olmalıdır. `progress` 0-100, `rating` 0-5 aralığındadır. Dışarıdan gelen ve eski kayıtlar her zaman `normalizeBook()` üzerinden geçirilmelidir. `metadata` sağlayıcıya göre değişir; Google Books alanları camelCase, Open Library alanları çoğunlukla snake_case kullanır.

## ISBN ekleme akışları

- Normal `Kamera ile Tara` ilk geçerli barkodu okuyunca kamerayı kapatır, bilgileri forma getirir ve kullanıcının düzenleyip kaydetmesini bekler.
- `Hızlı kitap ekle` kamera oturumunu açık tutar. Geçerli ISBN-10/ISBN-13 değerleri `quickScanQueue` içinde tekilleştirilerek gösterilir.
- `İşlemi tamamla` kuyruğu sırayla işler. Her kitap için bilgiler forma doldurulur; kullanıcı `Kitabı Kaydet` ile kaydetmeden sonraki ISBN'e geçilmez.
- Kuyruktaki ISBN mevcut kitapla yineleniyorsa veya metadata bulunamazsa kullanıcı bilgilendirilir ve sonraki ISBN'e geçilir.

## Senkronizasyon kuralları

Normal kayıt, düzenleme ve durum değişikliği Supabase'e upsert yapar; uzak kitapları silmez. Silme ve "Tümünü Sil" işlemleri özellikle `{ allowDelete: true }` seçeneğini vermelidir. Ağ yokken son kitap listesi kullanıcıya gösterilir ve bekleyen senkron localStorage'da tutulur.

Profil bilgileri `PROFILE_KEY` ile kullanıcıya özel localStorage alanında tutulur. Oturumlu kullanıcı profili `profiles` tablosuna upsert edilir ve RLS nedeniyle yalnızca sahibi tarafından okunup değiştirilebilir. Şema güncellenirken `supabase-schema.sql` içindeki profil tabloları da çalıştırılmalıdır.

Arkadaşlıklar `friendships` tablosunda `pending`, `accepted` veya `declined` durumlarıyla tutulur. Profil araması ve arkadaşlık kayıtları yalnızca oturumlu kullanıcılar içindir; misafir modunda arkadaşlık işlemleri kullanılamaz. `profiles` için arkadaş aramasını destekleyen authenticated select politikası, kullanıcıların profil kartı alanlarını diğer oturumlu kullanıcılara görünür kılar.

Akış gönderileri `feed_posts` tablosunda kitap bilgilerinin paylaşım anındaki özeti olarak tutulur. Gönderiler yalnızca gönderi sahibi ve `accepted` durumundaki arkadaşları tarafından okunabilir; kitapların özel `notes`, `review` ve ilerleme alanları akışa aktarılmaz.

## React geçişi

React/Vite altyapısı kademeli geçiş için eklenmiştir. Ana giriş `index.html` üzerinden React tarafından başlatılır; mevcut işlevler geçici `LegacyApp` uyumluluk katmanı ile `legacy.html` içinden yüklenir. Uygulama rotaları `/feed`, `/library`, `/add`, `/stats`, `/quotes`, `/profile` ve `/friends` olarak Netlify üzerinde ayrı URL'lerdir. React önizlemesi `react.html` girişinden açılır. Geliştirme için `npm run dev`, üretim doğrulaması için `npm run build` kullanılır.

React kodu `src/` altında tutulur. İlk React yüzü mevcut localStorage kitaplarını yalnızca okur; Supabase, auth, tarayıcı ve sosyal özellikler taşınmadan önce veri erişimi ayrı bir React uyumlu katmana ayrılmalıdır. Eski `js/` modüllerini doğrudan bileşen içinde DOM manipülasyonu için kullanmayın.

Taşıma sırası: ortak veri sözleşmeleri, kitaplık ve kitap kartları, kitap ayrıntısı/modal akışı, profil ve arkadaşlıklar, akış, en son kamera/OCR ve PWA entegrasyonu. Her adımda eski girişin çalıştığı, `npm run build`, `npm run check`, `npm test` ve `npm run lint` kontrolleri doğrulanmalıdır.

## Geliştirme kuralları

1. Uygulama için build sistemi yoktur; dosyalar tarayıcı ES modülleri olarak doğrudan çalışır. Kalite araçları Node.js üzerinden çalışır.
2. Yeni kullanıcı verileri için kullanıcı anahtarı `getUserStorageKey()` ile oluşturulmalıdır.
3. API yanıtları eksik veya hatalı olabilir; alanlara erişmeden önce tip kontrolü yapın.
4. Kullanıcı metni DOM'a yazılırken `textContent` tercih edin. HTML üretmek gerekiyorsa mevcut escape yardımcılarını kullanın.
5. Kitap ayrıntısında kapak için `getBookCoverUrl()` kullanın; kapak yoksa ayrıntı sayfası yine çalışmalıdır.
6. CDN veya yeni ağ bağımlılığı eklenirse `sw.js` ve çevrimdışı davranışını güncelleyin.
7. Değişiklik sonrası `git diff --check`, ilgili dosya aramaları ve mümkünse gerçek tarayıcı testi yapılmalıdır.
8. Değişiklik tamamlanmadan `npm run check`, `npm test`, `npm run lint` ve `npm run format:check` çalıştırılmalıdır.

## Bilinen çalışma sınırları

- Uygulamanın build adımı yoktur; kalite araçları `package.json` üzerinden yönetilir ve Node.js yerleşik test runner'ı kullanılır.
- Kamera, OCR ve Google Books özellikleri ağ/tarayıcı izinlerine bağlıdır.
- `supabase-config.js` içindeki anahtar public anon anahtar olmalıdır; service-role anahtarı kesinlikle eklenmemelidir.
- Supabase tarafında şema değişirse önce `supabase-schema.sql` ve `storage.js` birlikte güncellenmelidir.

## Güvenli değişiklik akışı

Önce bu dosyayı ve ilgili modülü okuyun, sonra veri sözleşmesini bozmayacak küçük bir değişiklik yapın. Git geçmişindeki son commit'leri kontrol edin. Kullanıcı açıkça istemedikçe geçmişi yeniden yazmayın ve başka dosyalardaki kullanıcı değişikliklerini silmeyin.
