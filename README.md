# Kitap Kütüphanem

Bu proje, sahip olduğunuz kitapları takip etmek için hazırlanmış hafif bir statik web uygulamasıdır. Veriler tarayıcıdaki `localStorage` içinde saklanır. Netlify gibi statik barındırma servislerinde rahatça yayınlanabilir.

## Özellikler
- Kitap ekleme
- Yazar, yıl, etiket bilgileri
- Okundu / okunmadı takibi
- Arama ve filtreleme
- Düzenleme ve silme
- JSON dışa aktarma ve içe aktarma
- Tüm verileri temizleme

## Yerel çalıştırma
Aşağıdaki komut ile yerelde çalıştırabilirsiniz:

```bash
cd c:\projects\book_library
python -m http.server 8000
```

Ardından tarayıcıda şu adrese gidin:

```text
http://localhost:8000
```

## Netlify dağıtımı
1. Bu klasörü bir Git deposuna ekleyin.
2. GitHub'a gönderin.
3. Netlify'de `New site from Git` seçin.
4. Repo'yu bağlayın.
5. Build komutu boş bırakın ve publish directory olarak klasör kökünü seçin.

## Dosyalar
- `index.html`
- `styles.css`
- `app.js`
- `netlify.toml`
