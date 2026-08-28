# Kitap Kütüphanem

Kitap Kütüphanem, kişisel kitap koleksiyonunu takip etmek için hazırlanmış Netlify uyumlu bir web uygulamasıdır. Uygulama tarayıcıda çalışır, verileri hızlı erişim için `localStorage` içinde tutar ve kullanıcı oturumu varsa Supabase ile kişiye özel olarak senkronize eder.

## Özellikler

- Hızlı kitap ekleme: kamerayla art arda ISBN toplama ve sırayla formdan kaydetme

- Manuel kitap ekleme
- E-posta doğrulamalı hesap ve Google ile giriş
- Kullanıcı adıyla arkadaş arama, arkadaşlık isteği ve arkadaş listesi
- Arkadaşların kitap paylaşımlarını gösteren sosyal akış
- Kitap eklerken başlık, yazar, kapak ve notu akışta paylaşma
- ISBN / barkod ile otomatik kitap bilgisi çekme
- Google Books ve Open Library Search fallback ile ISBN araması
- Kamera erişimi ile barkod tarama
- Kamera görüntüsündeki yazılı ISBN'yi OCR ile okuma
- Okundu / okunuyor / okunacak takibi
- İlerleme, puan, raf, yorum ve not alanları
- Arama ve filtreleme
- ISBN, etiket, kategori, format ve yıl aralığına göre gelişmiş filtreleme
- İlişkili kitap önerileri
- Düzenleme ve silme
- Alıntı defteri
- Okuma istatistikleri ve rozetler
- JSON dışa aktarma, yedek alma ve içe aktarma
- `db.json` formatında yerel indirme
- Netlify üzerinde yayınlanabilir statik yapı
- Telefona ve masaüstüne kurulabilen PWA desteği
- Supabase ile kullanıcı hesabı ve kişiye özel kitaplık
- Senkronizasyon durumunu gösteren çevrimiçi/çevrimdışı durum bilgisi

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

## Geliştirme Kontrolleri

Node.js kurulumundan sonra proje kökünde şu komutlar çalıştırılabilir:

```bash
npm install
npm run check
npm test
npm run lint
npm run format:check
```

`npm run check` JavaScript sözdizimini, JSON dosyalarını, HTML ID'lerini ve göreli import yollarını kontrol eder. `npm test` ISBN ve kitap veri sözleşmesi testlerini çalıştırır. GitHub Actions aynı kontrolleri her push ve pull request'te otomatik çalıştırır.

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
2. İlk kurulumda SQL Editor'da `supabase-schema.sql` dosyasını çalıştırın. Bu şema kitapların yanında kullanıcı profili için `profiles`, arkadaşlıklar için `friendships` ve sosyal akış için `feed_posts` tablolarını da oluşturur.
   Mevcut veritabanına sosyal akışı sonradan ekliyorsanız verileri silmeyen `supabase-feed-migration.sql` dosyasını çalıştırın.
3. Project Settings > API bölümündeki Project URL ve anon public key değerlerini `supabase-config.js` içine yazın.
4. Supabase Authentication > URL Configuration bölümünde canlı Netlify adresini Site URL olarak ekleyin.
5. E-posta doğrulaması kullanılıyorsa SMTP ve Redirect URL ayarlarını yapılandırın.

### Auth yönlendirmesi ve Google ile giriş

Kayıt doğrulama bağlantısı ve Google girişi, uygulamanın açıldığı alan adına otomatik olarak yönlendirilir. Farklı bir sabit alan adı kullanmak isterseniz `supabase-config.js` içine şu satırı ekleyin:

```js
window.APP_URL = 'https://sitenizin-adresi.example';
```

Supabase Dashboard > Authentication > URL Configuration bölümünde canlı adresi Redirect URLs listesine ekleyin. Google girişi için Authentication > Providers > Google bölümünü etkinleştirip Google Cloud Console'dan Web OAuth Client ID ve Client Secret değerlerini Supabase'e girin. Google Cloud tarafındaki Authorized redirect URI olarak Supabase panelinde gösterilen callback adresini kullanın; bu proje için adres genellikle `https://<proje-referansi>.supabase.co/auth/v1/callback` biçimindedir.

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
- `js/core/config.js`
- `js/core/storage.js`
- `js/ui/ui.js`
- `js/ui/toast.js`
- `js/features/isbn.js`
- `js/features/quotes.js`
- `js/features/badges.js`
- `supabase-config.js`
- `supabase-schema.sql`
- `supabase-feed-migration.sql`
- `sw.js`
- `netlify.toml`
- `netlify/functions/books.js`

## Tarayici UI testleri

Playwright smoke testleri masaustu Chrome ve iPhone emulasyonu ile ana navigasyonu, yerel modu ve bildirim panelini kontrol eder:

```bash
npm install
npx playwright install chromium
npm run test:ui
```

## Notlar

- Yerel moddaki veriler yalnızca kullanılan tarayıcıda tutulur.
- Supabase oturumu açıldığında kitaplar kullanıcı hesabına göre senkronize edilir.
- Silme işlemleri Supabase'e yalnızca açık silme veya tümünü temizleme eylemlerinde yansıtılır.
- Dışa aktarma ve yedek dosyaları gerektiğinde içe aktarılabilir.
