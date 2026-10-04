# BoŞvEr

Haritada gerçek otoparkları gösterip boş yer, tarife ve yol tarifi veren bir web uygulaması. Fiyat ve doluluk uydurulmaz: İstanbul için İSPARK, İzmir için İZUM / İZELMAN açık verisi, diğer şehirler için OpenStreetMap.

Adres: [github.com/bugutekinenes900-dot/bosver](https://github.com/bugutekinenes900-dot/bosver)

## Çalıştırma

Node.js kurulu olsun. Windows’ta `baslat.bat` dosyasına çift tıkla; tarayıcı **http://localhost:3000** açar. Chrome bu adresi güvenli sayar (ünlem olmaz). Aynı Wi‑Fi’deki telefon için konsoldaki `http://192.168.x.x:3000` adresini kullan; o HTTP olduğu için telefonda “Güvenli değil” yazabilir.

```bash
npm install
npm start
```

## Ne var

- Harita (Leaflet), pin kümeleme, GPS, Google yol tarifi
- OSM isimleri: generic “Otopark” yerine sokak / konumdan anlamlı ad
- İSPARK anlık boş yer ve tarife; İzmir canlı doluluk + İZELMAN ücret listesi
- Üyelik (Ücretsiz / Plus / Pro, demo — ödeme yok)
- Park ettim / çıktım, tahmini ücret
- Plus+: favori otoparkta yer açılınca bildirim

Ankara’da belediye otopark API’si yok; orada yalnızca OSM kayıtları gösterilir.

## Veri kaynakları

| Kaynak | Bölge | Canlı doluluk |
| --- | --- | --- |
| [İSPARK / İBB](https://api.ibb.gov.tr/ispark/Park) | İstanbul | Evet |
| [İzmir açık veri (İZUM)](https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar) | İzmir | Evet |
| [OpenStreetMap](https://www.openstreetmap.org) | Her yer | Hayır |

`parking.db` ve sunucu logları git’e girmez.

## Kalıcı adres (Vercel, kart yok)

Render’ın sunucu planı kart istiyor. Bu uygulama Express olduğu için ücretsiz Hobby planı olan Vercel kullanılır.

1. https://vercel.com/signup adresinden GitHub ile gir. Kart istense bile ekleme; Hobby yeterli.
2. Add New, Project, `bosver` reposu. Kök dizin proje kökü olsun, `anar` değil.
3. Framework Preset **Other** olsun, Output Directory boş kalsın. Deploy. Adres `https://....vercel.app` olur ve bilgisayar kapalıyken de açıktır. Kırmızı deploydan sonra bu düzeltme için Vercel’de **Redeploy** de.

Harita verisi İSPARK, İzmir ve OSM’den gelir. Üyelik ve favori kayıtları bu ücretsiz planda kalıcı disk olmadığı için silinebilir. Üyelik ödemesi hâlâ demo, para çekilmez.

## GitHub

Push ve pull request’te Actions `CI` işi sözdizimini kontrol eder ve sunucunun `/api/tiers` ile ayağa kalktığını dener. Lisans: MIT.

## `anar/`

Aynı depoda ayrı bir sohbet arayüzü taslağı duruyor; BoŞvEr sunucusundan bağımsızdır.
