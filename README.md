# my-restaurant-queue

ระบบ Open Source สำหรับร้านอาหาร/สถานบันเทิง: หน้าลูกค้า (รองรับการห่อเป็น LINE Mini App), จองโต๊ะ, คิว, สั่งอาหาร, KDS, แอดมิน และ TV signage ในเซิร์ฟเวอร์เดียว เหมาะเป็นจุดเริ่มต้นที่ fork แล้วเปลี่ยนข้อมูลร้านได้ทันที

## สถาปัตยกรรม

```text
Customer / LINE Mini App ─┐
Admin Console ────────────┼─ HTTP API + Server-Sent Events ─ JSON store (replaceable)
Kitchen Display ──────────┤
TV Signage ───────────────┘
```

ใช้ Node.js 20 แบบไม่มี runtime dependency จึง deploy ง่ายบน Render. การเปลี่ยนสถานะจะกระจายไปยังทุกหน้าจอแบบ real-time ผ่าน Server-Sent Events. ที่เก็บข้อมูลตอนนี้เป็น JSON เพื่อให้เริ่มใช้งานได้ทันที; บน production ให้เปลี่ยนเป็น Postgres และ object storage ตามแผนด้านล่าง

## เริ่มใช้งาน

```bash
cp .env.example .env
# แก้ RESTAURANT_NAME, ลิงก์ร้าน และ ADMIN_TOKEN
npm start
```

เปิด:

- `/` — ลูกค้า: จองโต๊ะ, รับคิว, สั่งอาหาร, ส่งข้อความ
- `/admin` — แอดมิน (กรอก `ADMIN_TOKEN`)
- `/kds` — จอครัว
- `/tv` — จอ TV signage

ข้อมูลตัวอย่างจะถูกเขียนไปที่ `data/store.json` เมื่อมีการเปลี่ยนแปลง. บน Render free disk เป็นชั่วคราว จึงต้องใช้ฐานข้อมูลภายนอกก่อนเปิดใช้งานจริง.

## Deploy บน Render

1. Fork คลังนี้ขึ้น GitHub แล้วกด **New > Blueprint** ใน Render เพื่อเลือก `render.yaml`.
2. ตั้งค่า environment variables จาก `.env.example` ใน Render dashboard; อย่า commit `.env`.
3. กำหนด `ADMIN_TOKEN` ที่คาดเดายาก และเปลี่ยน `DATA_FILE` ไปยัง storage ที่เหมาะสม หรือแทนที่ storage adapter ด้วย Postgres.
4. ตั้ง LINE LIFF endpoint เป็น URL ของบริการ แล้วส่ง LINE credentials เฉพาะผ่าน Render environment variables.

## สิ่งที่ MVP ทำได้

- แผนผังโต๊ะที่กดเลือกได้, การยืนยันอายุ, จองและออก E-ticket demo
- คิวเรียลไทม์, เมนู/ออเดอร์และสถานะใน KDS
- จัดการโต๊ะ, เรียกคิว, sold out, เพิ่มเมนู และอนุมัติเนื้อหา
- TV แสดงคิว, สไลด์ และโพสต์ที่ผ่าน moderation
- Split bill endpoint: `POST /api/split-bill` กับ `{ "orderId": "...", "people": 3 }`

## แผนการต่อยอดเป็น Production

1. **ข้อมูลและสิทธิ์:** PostgreSQL (Prisma/Drizzle), Redis สำหรับ lock โต๊ะและ queue, account/RBAC และ audit log.
2. **LINE:** LIFF SDK ใน `/`, login verification ที่ server, LINE Messaging API สำหรับ Flex Message E-ticket; ตรวจ signature webhook ทุกครั้ง.
3. **การชำระเงิน:** PromptPay QR จากผู้ให้บริการที่ผ่านมาตรฐาน และ Stripe Payment Intents; สร้างสถานะ paid จาก webhook ที่ verify แล้วเท่านั้น. ห้ามเชื่อยอดเงินจาก browser.
4. **ไฟล์/เนื้อหา:** upload แบบ signed URL ไป S3/Cloudinary, ตรวจชนิด/ขนาดไฟล์, antivirus และ moderation ก่อน approve.
5. **ความเชื่อถือได้:** transaction กันโต๊ะซ้ำ, expiry worker สำหรับเงินมัดจำ/hold, rate limit, CSRF/CSP, encrypted secrets, backup และ monitoring.

## API หลัก

| Endpoint | หน้าที่ |
| --- | --- |
| `GET /api/public` | ข้อมูลที่แสดงสาธารณะ |
| `POST /api/reservations` | จองโต๊ะ (ต้อง `ageConfirmed`) |
| `POST /api/queue`, `/api/orders`, `/api/posts` | สร้างคิว, ออเดอร์, เนื้อหารออนุมัติ |
| `GET /api/events` | real-time event stream |
| `GET /api/admin` และ `/api/admin/*` | แอดมิน (ส่ง `x-admin-token`) |

## ความปลอดภัย

โค้ดนี้ไม่มี secret ฝังอยู่ และ `.env` ถูก ignore. Payment และ E-ticket ใน MVP เป็นเพียง demo — ไม่รับเงิน ไม่สร้าง PromptPay QR จริง และไม่ส่ง Flex Message จนกว่าจะเชื่อม provider + webhook verification ตามแผน production.

Released under the [MIT License](LICENSE).
