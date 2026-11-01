import { HttpError } from '../middleware/http-error.js';

export function createVleeeWebMarketSearch() {
  return async function searchWebMarket() {
    if (!process.env.VLEEE_API_KEY?.trim())
      throw new HttpError(503, 'VLEEE_NOT_CONFIGURED', 'Vleee belum dikonfigurasi di server.');
    throw new HttpError(422, 'VLEEE_WEB_SEARCH_UNAVAILABLE', 'Barang ini belum tersedia di PIHPS. Akses penelusuran sumber web Vleee belum terverifikasi, sehingga harga aktual belum dapat ditampilkan. Pilih komoditas PIHPS atau gunakan Tanya saran untuk bantuan usaha.');
  };
}
