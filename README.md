# CloudLock SafeDrop Backend 🗿

Backend API prototype berbasis **Express.js** untuk layanan **CloudLock SafeDrop**.

## Tentang Proyek
Repositori ini berisi implementasi awal (prototype) layanan backend untuk mendukung alur kerja **CloudLock SafeDrop**, yang disusun sebagai fondasi pengembangan API, pengelolaan data/berkas, dan integrasi klien.

## Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Deployment (Prototype):** Render

## Menjalankan Secara Lokal
1. Clone repositori ini:
   ```bash
   git clone https://github.com/aryaadyatma303-dev/cloudlock-safedrop-backend.git
   cd cloudlock-safedrop-backend
   ```
2. Install dependensi:
   ```bash
   npm install
   ```
3. Siapkan file `.env` (jika diperlukan), lalu jalankan server:
   ```bash
   node start
   ```
## Catatan Prototype
   Proyek ini masih berada pada tahap prototype sehingga struktur endpoint, konfigurasi keamanan, dan skema data masih dapat berubah seiring iterasi pengembangan.

## Simulasi & Debugging Lokal (`public/controller/controller.html`)

Repositori ini menyertakan halaman **`public/controller/controller.html`** untuk keperluan eksperimen dan debugging lokal pada tahap prototype.

### Kegunaan
- **Simulasi Front-End:** Menguji alur trigger/aksi dari sisi klien ke API ExpressJS tanpa bergantung pada front-end utama.
- **Simulasi Respons ESP / Arduino:** Menirukan payload atau status balasan perangkat keras (ESP/Arduino) guna menguji logika backend dan alur status SafeDrop secara lokal.

### Cara Penggunaan (Eksperimen Lokal)
1. Jalankan server ExpressJS secara lokal (`npm start` atau sesuai skrip di `package.json`).
2. Buka halaman controller melalui server lokal (sesuaikan dengan konfigurasi static route / path di Express, misalnya `/controller/controller.html`).
3. Gunakan kontrol yang tersedia untuk mengirim simulasi event/respons dan pantau log/respons pada terminal atau konsol browser.

> **Catatan:** Karena berada di bawah folder `public/`, pastikan path atau kontrol simulasi ini tetap aman jika aplikasi mulai diarahkan ke lingkungan yang lebih terbuka.
