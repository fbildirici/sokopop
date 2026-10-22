# ŞOKOPOP — 90'lar Magazin Yarışması

İki takımın telefonla oynadığı, 90'lar magazin temalı parti oyunu. Büyük ekran (TV/laptop) QR gösterir, herkes telefonundan katılır.

## Modlar

**🎤 Bilgi Yarışması** — 190+ soruluk arşivden her oyunda rastgele sorular (şıklar da karışır).
Soru büyük ekranda, şıklar telefonlarda. Doğru ve hızlı olan çok kazanır:
1000 puana kadar hız puanı, ilk doğruya +100, üst üste doğrulara seri bonusu.
Sonda **takım şampiyonu**, **bireysel podyum** ve özel ödüller (Flaş Muhabir, Manşet Serisi) açıklanır.

**🤐 Magazin Tabu** — Anlatıcı kartı kendi telefonunda görür, rakip takım yasaklı kelimeleri izleyip TABU! basar.

Takımlar adlarını telefonlarından değiştirebilir.

## Nasıl çalışır

Sunucu yok: oyun motoru büyük ekranın tarayıcısında çalışır, telefonlar ona
[PeerJS](https://peerjs.com) (WebRTC) ile doğrudan bağlanır. Bu yüzden site tamamen statiktir
ve Vercel'de ek ayar gerektirmeden çalışır. Telefonların aynı Wi‑Fi'de olması gerekmez.
Büyük ekran sayfası yenilense de oyun kaldığı yerden devam eder.

## Yayınlama (Vercel)

Repoyu Vercel'e bağlamak yeterli — `vercel.json` çıktıyı `public/` klasöründen sunar.

## Yerelde deneme

```bash
npm start
```

Terminalde yazan ağ adresini (ör. `http://192.168.1.20:3000`) büyük ekranda açın;
`localhost` ile açarsanız telefonlar QR'daki adrese ulaşamaz.

## İçerik

- Sorular: `public/data/questions.js` — `{ c: kategori, q: soru, a: [DOĞRU, yanlış, yanlış, yanlış], f: figür, x: açıklama }`
- Tabu kartları: `public/data/tabu-cards.js`
- Figür afişi: `public/img/figurler.png` (soru ekranlarında ilgili karakter buradan kırpılır)
