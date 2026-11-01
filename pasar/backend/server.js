import "dotenv/config";
import { networkInterfaces } from "node:os";
import { app } from "./src/app.js";
import { pool } from "./src/config/database.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65_535)
  throw new Error("PORT harus berupa bilangan antara 1 dan 65535.");

function lanAddresses() {
  return [
    ...new Set(
      Object.values(networkInterfaces())
        .flat()
        .filter((address) => address && !address.internal && address.family === "IPv4")
        .map((address) => address.address),
    ),
  ];
}

if (pool)
  pool.on("error", () => {
    console.error("PostgreSQL: koneksi idle gagal; periksa layanan database.");
  });

const server = app.listen(port, host, () => {
  console.log(`Pantau Pasar berjalan di http://localhost:${port}`);
  if (host === "0.0.0.0" || host === "::") {
    for (const address of lanAddresses())
      console.log(`Akses jaringan lokal: http://${address}:${port}`);
  } else if (host !== "127.0.0.1" && host !== "::1") {
    console.log(`Akses jaringan lokal: http://${host}:${port}`);
  } else {
    console.log("Server hanya bisa diakses dari komputer ini (localhost).");
  }
  console.log(
    `Layanan: PostgreSQL ${pool ? "aktif" : "nonaktif"} | Vleee ${process.env.VLEEE_API_KEY ? "dikonfigurasi" : "tidak dikonfigurasi"}`,
  );
  console.log("Log request API aktif; isi form dan kredensial tidak dicetak.");
});

server.requestTimeout = 120_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE"
    ? "Port sudah digunakan. Ubah PORT di konfigurasi lokal lalu jalankan kembali."
    : "Server tidak dapat dimulai. Periksa HOST dan PORT pada konfigurasi lokal.");
  process.exitCode = 1;
  if (pool) pool.end().catch(() => {});
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    const timeout = setTimeout(() => { server.closeAllConnections(); process.exitCode = 1; }, 10_000);
    timeout.unref();
    server.close(async () => {
      try { if (pool) await pool.end(); } catch { process.exitCode = 1; }
      clearTimeout(timeout);
    });
    server.closeIdleConnections();
  });
}
