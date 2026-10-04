# BoŞvEr

Haritada gerçek otoparkları gösterip boş yer, tarife ve yol tarifi veren bir web uygulaması. Fiyat ve doluluk uydurulmaz: İstanbul için İSPARK, İzmir için İZUM / İZELMAN açık verisi, diğer şehirler için OpenStreetMap.

Adres: [github.com/bugutekinenes900-dot/bosver](https://github.com/bugutekinenes900-dot/bosver)

## Çalıştırma

Node.js kurulu olsun. Windows’ta `baslat.bat` dosyasına çift tıkla; tarayıcı **http://localhost:3000** adresini açar.

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

## GitHub

Push ve pull request’te Actions `CI` işi sözdizimini kontrol eder ve sunucunun `/api/tiers` ile ayağa kalktığını dener. Lisans: MIT.

## GitHub

Push ve pull request’te Actions `CI` işi sözdizimini kontrol eder ve sunucunun `/api/tiers` ile ayağa kalktığını dener. Lisans: MIT.

## `anar/`

Aynı depoda ayrı bir sohbet arayüzü taslağı duruyor; BoŞvEr sunucusundan bağımsızdır.
