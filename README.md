# Kitap Kütüphanem

Bu proje, sahip olduğunuz kitapları takip etmek için hazırlanmış, Netlify uyumlu bir web uygulamasıdır. Manuel ekleme, ISBN / barkod ile otomatik sorgulama ve kalıcı veri kaydı için Netlify Functions kullanır.

## Özellikler
- Manuel kitap ekleme
- ISBN / barkod girişi ile otomatik kitap bilgisi çekme
- Google Books ve Open Library Search fallback ile genişletilmiş ISBN araması
- Kamera erişimi ile barkod tarama (tarayıcı destekliyse)
- Kamera görüntüsündeki yazılı ISBN'yi OCR ile okuma
- Okundu / okunmadı takibi
- Arama ve filtreleme
- Düzenleme ve silme
- `db.json` üzerinden kalıcı kayıt
- JSON dışa aktarma / içe aktarma
- Netlify üzerinde yayınlanabilir statik yapı
- Telefona ve masaüstüne kurulabilen PWA desteği
- Supabase ile kullanıcı hesabı ve kişiye özel kitaplık

## Yerel çalıştırma
Netlify Functions çalışması için yerelde bir tarayıcı ve Netlify CLI ya da benzer bir yerel sunucu gerekir.

En basit yerel test için kök klasörde bir statik sunucu da çalıştırılabilir:

```bash
cd c:\projects\book_library
python -m http.server 8000
```

Ardından tarayıcıda:

```text
http://localhost:8000
```

## Netlify dağıtımı
1. Bu klasörü bir Git deposuna ekleyin.
2. GitHub/GitLab/Bitbucket’a gönderin.
3. Netlify’de “New site from Git” ile repo’yu bağlayın.
4. Build komutunu boş bırakın.
5. Publish directory olarak proje kökünü seçin.
6. Netlify, `netlify/functions` içindeki serverless işlevleri otomatik algılar.

## Supabase kurulumu
1. Supabase projesi oluşturun.
2. SQL Editor'da `supabase-schema.sql` dosyasını çalıştırın.
3. Project Settings > API bölümündeki Project URL ve anon public key değerlerini `supabase-config.js` içine yazın.
4. Supabase Authentication > URL Configuration bölümünde canlı Netlify adresini Site URL olarak ekleyin.
5. E-posta doğrulaması kullanılacaksa SMTP ve Redirect URL ayarlarını da yapılandırın.

Google Books isteğe bağlı API anahtarıyla da kullanılabilir. Kota sınırını artırmak için Google Cloud Console'dan Books API anahtarı alıp `supabase-config.js` içindeki `GOOGLE_BOOKS_API_KEY` alanına yazabilirsiniz. Boş bırakılırsa anahtarsız istek yapılır ve başarısız durumda Open Library Search kullanılır.

`supabase-config.js` yalnızca frontend için tasarlanmış public anon key içerir. Service role key'i bu dosyaya koymayın.

## PWA kurulumu
Site HTTPS üzerinden yayınlandığında tarayıcıdaki yükleme/kurulum seçeneği kullanılabilir. Telefonda tarayıcı menüsünden "Ana ekrana ekle" seçeneğini kullanın. Service worker uygulama kabuğunu önbelleğe alır; kitap verileri ve Supabase istekleri güncel kalması için ağ üzerinden çalışır.

## Dosyalar
- `index.html`
- `styles.css`
- `app.js`
- `db.json`
- `netlify.toml`
- `netlify/functions/books.js`

## Not
- `db.json` dosyası gerçek üretim ortamında Netlify Functions tarafından yazılır.
- Tarayıcı tarafı `localStorage` da fallback olarak çalışır.
