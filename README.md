# Kitap Kütüphanem

Bu proje, sahip olduğunuz kitapları takip etmek için hazırlanmış, Netlify uyumlu bir web uygulamasıdır. Manuel ekleme, ISBN / barkod ile otomatik sorgulama ve kalıcı veri kaydı için Netlify Functions kullanır.

## Özellikler
- Manuel kitap ekleme
- ISBN / barkod girişi ile otomatik kitap bilgisi çekme
- Kamera erişimi ile barkod tarama (tarayıcı destekliyse)
- Okundu / okunmadı takibi
- Arama ve filtreleme
- Düzenleme ve silme
- `db.json` üzerinden kalıcı kayıt
- JSON dışa aktarma / içe aktarma
- Netlify üzerinde yayınlanabilir statik yapı

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
