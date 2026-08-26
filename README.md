# Kitap Kütüphanem

Kitap Kütüphanem, kişisel kitap koleksiyonunu takip etmek için hazırlanmış Netlify uyumlu bir web uygulamasıdır. Uygulama tarayıcıda çalışır, verileri hızlı erişim için `localStorage` içinde tutar ve kullanıcı oturumu varsa Supabase ile kişiye özel olarak senkronize eder.

## Özellikler

- Manuel kitap ekleme
- ISBN / barkod ile otomatik kitap bilgisi çekme
- Google Books ve Open Library Search fallback ile ISBN araması
- Kamera erişimi ile barkod tarama
- Kamera görüntüsündeki yazılı ISBN'yi OCR ile okuma
- Okundu / okunuyor / okunacak takibi
- İlerleme, puan, raf, yorum ve not alanları
- Arama ve filtreleme
- Düzenleme ve silme
- Alıntı defteri
- Okuma istatistikleri ve rozetler
- JSON dışa aktarma, yedek alma ve içe aktarma
- `db.json` formatında yerel indirme
- Netlify üzerinde yayınlanabilir statik yapı
- Telefona ve masaüstüne kurulabilen PWA desteği
- Supabase ile kullanıcı hesabı ve kişiye özel kitaplık

## Yerel Çalıştırma

En basit yerel test için proje kökünde statik bir sunucu çalıştırın:

```bash
cd c:\projects\book_library
python -m http.server 8000
```

Ardından tarayıcıda açın:

```text
http://localhost:8000
```

Supabase ayarları yoksa veya bağlantı başarısızsa uygulamayı "Yerel Modda Kullan" seçeneğiyle yalnızca bu tarayıcıdaki `localStorage` üzerinden kullanabilirsiniz.

## Netlify Dağıtımı

1. Bu klasörü bir Git deposuna ekleyin.
2. GitHub/GitLab/Bitbucket'a gönderin.
3. Netlify'de "New site from Git" ile repoyu bağlayın.
4. Build komutunu boş bırakın.
5. Publish directory olarak proje kökünü seçin.

`netlify/functions/books.js` güvenlik nedeniyle kapalıdır ve `403` döner. Kalıcı çok kullanıcılı veri saklama için Supabase kullanılmalıdır.

## Supabase Kurulumu

1. Supabase projesi oluşturun.
2. SQL Editor'da `supabase-schema.sql` dosyasını çalıştırın.
3. Project Settings > API bölümündeki Project URL ve anon public key değerlerini `supabase-config.js` içine yazın.
4. Supabase Authentication > URL Configuration bölümünde canlı Netlify adresini Site URL olarak ekleyin.
5. E-posta doğrulaması kullanılıyorsa SMTP ve Redirect URL ayarlarını yapılandırın.

`supabase-config.js` yalnızca frontend için tasarlanmış public anon key içermelidir. Service role key'i bu dosyaya koymayın.

## Google Books API

Google Books anahtarı isteğe bağlıdır. Kota sınırını artırmak için Google Cloud Console'dan Books API anahtarı alıp `supabase-config.js` içindeki `GOOGLE_BOOKS_API_KEY` alanına yazabilirsiniz.

Anahtar frontend'de bulunduğu için Google Cloud tarafında HTTP referrer/domain kısıtı tanımlayın. Boş bırakılırsa anahtarsız istek yapılır ve başarısız durumda Open Library Search fallback olarak kullanılır.

## PWA Kurulumu

Site HTTPS üzerinden yayınlandığında tarayıcıdaki kurulum seçeneği kullanılabilir. Uygulamadaki "Uygulamayı yükle" düğmesi desteklenen tarayıcılarda kurulum penceresini açar; iPhone'da tarayıcı menüsünden "Ana ekrana ekle" seçeneğini kullanın.

Service worker uygulama kabuğunu önbelleğe alır. Kitap verileri ve Supabase istekleri güncel kalmaları için ağ üzerinden çalışır.

## Önemli Dosyalar

- `docs/AI_CONTEXT.md` (projeye katkı verecek yapay zekâlar için başlangıç rehberi)
- `index.html`
- `styles.css`
- `js/main.js`
- `js/storage.js`
- `js/ui.js`
- `js/isbn.js`
- `js/quotes.js`
- `js/badges.js`
- `supabase-config.js`
- `supabase-schema.sql`
- `sw.js`
- `netlify.toml`
- `netlify/functions/books.js`

## Notlar

- Yerel moddaki veriler yalnızca kullanılan tarayıcıda tutulur.
- Supabase oturumu açıldığında kitaplar kullanıcı hesabına göre senkronize edilir.
- Silme işlemleri Supabase'e yalnızca açık silme veya tümünü temizleme eylemlerinde yansıtılır.
- Dışa aktarma ve yedek dosyaları gerektiğinde içe aktarılabilir.
