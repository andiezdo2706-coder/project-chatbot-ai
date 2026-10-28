# Giới thiệu đồ án của Đỗ Đình Duy — Chatbot hỏi đáp tài liệu trên AWS

Kiến trúc serverless, không EC2/Nginx:

```
Trình duyệt ──► AWS Amplify Hosting (Next.js)
     │
     └─ POST /chat ──► Amazon API Gateway (HTTP API) ──► AWS Lambda (Node.js 22) ──► Amazon Bedrock (Converse API)
                                                             │
                                                             └─► Amazon CloudWatch Logs
```

Code đã viết xong. Bạn chỉ cần thao tác trên AWS Console theo checklist dưới đây và dán 1 URL vào Amplify.

| Thư mục | Nội dung |
|---|---|
| `web/` | Giao diện Next.js 15 (App Router, TypeScript) |
| `lambda/index.mjs` | Lambda: kiểm tra input → chọn ngữ cảnh tài liệu → gọi Bedrock → trả lời kèm nguồn `[S1]…` |
| `lambda/document.md` | Tài liệu mẫu (quy chế học vụ & thư viện, hư cấu). Sửa file này để đổi tài liệu |
| `lambda/function.zip` | Gói upload lên Lambda (tạo bằng `npm run zip`) |
| `aws/bedrock-invoke-policy.json` | IAM policy tối thiểu cho Lambda gọi Bedrock |
| `amplify.yml` | Cấu hình build Amplify (monorepo, app root `web`) |

> **Region:** đồ án này chạy trong **Asia Pacific (Singapore) `ap-southeast-1`**. Làm tất cả các bước trong cùng region này và kiểm tra góc phải Console luôn là `ap-southeast-1`. (Nếu làm ở `us-east-1` thì đổi prefix model từ `apac.` sang `us.` và URL API từ `ap-southeast-1` sang `us-east-1`.)

---

## Checklist 60 phút

### ⏱ 00–05 · Chạy thử local

```bash
cd lambda && npm install && npm test && npm run zip
```

```bash
cd web && npm install && npm run dev
```

Mở http://localhost:3000 — sidebar sẽ báo "⚠ Chưa cấu hình API URL", đúng như mong đợi.

### ⏱ 05–12 · Bước 1 — Bật model Bedrock

1. Console → **Amazon Bedrock** → menu trái **Model catalog**.
2. Tìm **Amazon Nova 2 Lite** (hoặc **Amazon Nova Lite**). Nova là model của Amazon nên không cần đăng ký Marketplace, rẻ, chạy tốt tiếng Việt.
   - ⚠ **Quan trọng:** các model Nova phải gọi qua **inference profile** có prefix region, KHÔNG dùng model ID gốc. Nếu dùng ID gốc (vd `amazon.nova-lite-v1:0`) sẽ bị lỗi `400 ... on-demand throughput isn't supported. Use an inference profile`.
   - Prefix **phải khớp region của Lambda**:
     - `us-east-1` / US → `us.` (vd `us.amazon.nova-lite-v1:0`)
     - `ap-southeast-1` / Singapore & APAC → `apac.` (vd `apac.amazon.nova-lite-v1:0`)
     - EU → `eu.`; hoặc bản global `global.amazon.nova-2-lite-v1:0`
   - Dùng sai prefix so với region sẽ bị lỗi. Nếu Lambda ở Singapore, dùng `apac.amazon.nova-lite-v1:0` (hoặc `apac.amazon.nova-2-lite-v1:0`).
   - Trong playground, chọn đúng mục **Inference profile** thay vì model gốc.
3. Bấm **Open in playground** → gõ "Xin chào" → có trả lời là OK.
   - Không cần bật model thủ công: trang *Model access* đã bị AWS gỡ, model serverless tự bật ở lần gọi đầu.
   - Nếu báo `ValidationException: Operation not allowed` → lỗi cấp tài khoản: kiểm tra Free plan (nâng lên Paid plan), phương thức thanh toán đã xác minh, Service Quotas của model ≠ 0, hoặc SCP nếu là tài khoản do trường/tổ chức cấp.
4. Muốn dùng model khác (vd. Claude): ghi lại **Model ID** hoặc **Inference profile ID** (dạng `us.xxx`) để dán vào biến `BEDROCK_MODEL_ID` ở bước 2. Model của bên thứ ba có thể cần điền form use-case lần đầu → tốn thời gian, nên demo bằng Nova trước.

### ⏱ 12–25 · Bước 2 — Tạo Lambda

1. Console → **Lambda** → **Create function** → *Author from scratch*
   - Function name: `document-chatbot-api`
   - Runtime: **Node.js 22.x**, Architecture: arm64 (rẻ hơn) hoặc x86_64 đều được
   - Bấm **Create function**.
2. Tab **Code** → **Upload from** → **.zip file** → chọn `lambda/function.zip` → Save.
   Kiểm tra *Runtime settings*: Handler phải là `index.handler`.
3. Tab **Configuration** → **General configuration** → Edit → **Timeout: 30 sec**, Memory 256 MB → Save.
4. **Configuration** → **Environment variables** → Edit → Add:
   - `BEDROCK_MODEL_ID` = inference profile khớp region, vd `apac.amazon.nova-lite-v1:0` (Singapore) hoặc `us.amazon.nova-lite-v1:0` (us-east-1)
   - (tùy chọn, làm sau khi có URL Amplify) `ALLOWED_ORIGIN` = `https://main.xxxx.amplifyapp.com`
5. **Configuration** → **Permissions** → click tên **Role name** (mở IAM) → **Add permissions** → **Create inline policy** → tab **JSON** → dán nội dung `aws/bedrock-invoke-policy.json` → Next → tên `BedrockInvokeForChatbot` → **Create policy**.
6. Quay lại Lambda → tab **Test** → Create event, dán JSON dưới đây → **Test**:

   ```json
   {
     "requestContext": { "http": { "method": "POST" } },
     "body": "{\"question\":\"Điều kiện tốt nghiệp là gì?\"}"
   }
   ```

   Kết quả mong đợi: `statusCode: 200`, `body` có `answer` và `sources`. Nếu lỗi xem bảng **Xử lý sự cố** bên dưới.

### ⏱ 25–32 · Bước 3 — Tạo API Gateway (HTTP API)

1. Console → **API Gateway** → **Create API** → **HTTP API** → **Build**.
2. **Add integration** → Lambda → chọn `document-chatbot-api`. API name: `document-chatbot-http`. Next.
3. Configure routes: Method **POST**, Resource path **/chat**, target là Lambda trên. Next.
4. Stage: giữ **`$default`** (auto-deploy). Next → **Create**.
5. Menu trái **CORS** → **Configure**:
   - Access-Control-Allow-Origin: `*` (sau khi có domain Amplify thì đổi thành domain đó)
   - Access-Control-Allow-Headers: `content-type`
   - Access-Control-Allow-Methods: `POST`, `OPTIONS`
   - Save.
6. (Khuyên dùng, chống tốn tiền) Menu **Throttling** → stage `$default` → Edit → Burst `10`, Rate `5` → Save.
7. Copy **Invoke URL** ở trang API (dạng `https://vnenos15jd.execute-api.ap-southeast-1.amazonaws.com`). URL chatbot là:

   ```
   https://vnenos15jd.execute-api.ap-southeast-1.amazonaws.com/chat
   ```

   Kiểm tra nhanh trên Terminal:

   ```bash
   curl -s -X POST https://vnenos15jd.execute-api.ap-southeast-1.amazonaws.com/chat -H "Content-Type: application/json" -d '{"question":"Mượn sách tối đa bao nhiêu cuốn?"}'
   ```

   > URL API thực tế của đồ án này: `https://vnenos15jd.execute-api.ap-southeast-1.amazonaws.com/chat` (region **ap-southeast-1 / Singapore**).

### ⏱ 32–37 · Bước 4 — Nối frontend với API (local)

```bash
cd web && cp .env.example .env.local
```

Sửa `NEXT_PUBLIC_CHAT_API_URL` trong `web/.env.local` thành URL trên, ví dụ:

```
NEXT_PUBLIC_CHAT_API_URL=https://vnenos15jd.execute-api.ap-southeast-1.amazonaws.com/chat
```

Chạy lại `npm run dev`, hỏi thử 1 câu. Sau đó:

```bash
cd web && npm run build
```

Build phải thành công trước khi đẩy lên Amplify.

### ⏱ 37–50 · Bước 5 — Deploy bằng Amplify

1. Tạo repository mới (trống) trên GitHub, rồi ở thư mục gốc `project-chatbot-ai`:

   ```bash
   git init && git add . && git commit -m "feat: document chatbot on AWS"
   ```

   ```bash
   git branch -M main && git remote add origin <GITHUB_REPO_URL> && git push -u origin main
   ```

2. Console → **AWS Amplify** → **Create new app** → **GitHub** → authorize → chọn repo, branch `main`.
3. Tick **My app is a monorepo** → Monorepo root directory: `web`.
4. Build settings: Amplify sẽ đọc `amplify.yml` có sẵn trong repo (framework Next.js - SSR).
5. **Advanced settings** → **Environment variables** → thêm
   `NEXT_PUBLIC_CHAT_API_URL` = `https://vnenos15jd.execute-api.ap-southeast-1.amazonaws.com/chat`
6. **Save and deploy**, chờ ~3–5 phút. Nhận URL `https://main.xxxx.amplifyapp.com`.

> Biến `NEXT_PUBLIC_*` được "nhúng" lúc build. Đổi URL API → phải **Redeploy** app trên Amplify.

### ⏱ 50–55 · Bước 6 — Khóa CORS & đặt Budget

1. API Gateway → CORS → đổi Allow-Origin từ `*` thành `https://main.xxxx.amplifyapp.com` (thêm `http://localhost:3000` nếu còn dev local).
2. Lambda → Environment variables → `ALLOWED_ORIGIN` = cùng domain đó.
3. Console → **Billing and Cost Management** → **Budgets** → Create budget → template *Zero spend* hoặc *Monthly cost budget* 5 USD → nhập email nhận cảnh báo.

### ⏱ 55–60 · Bước 7 — Tổng duyệt demo

Hỏi lần lượt 4 câu gợi ý ở sidebar, mở CloudWatch log (xem phần Demo).

---

## Kịch bản demo (5 phút)

1. **Giới thiệu kiến trúc** (sơ đồ đầu file): người dùng → Amplify → API Gateway → Lambda → Bedrock.
2. **Mở URL Amplify**, bấm lần lượt:
   - "Nội dung chính của tài liệu là gì?" → tóm tắt, nhiều nguồn.
   - "Điều kiện để được xét tốt nghiệp là gì?" → 130 tín chỉ, GPA ≥ 2,0, IELTS 5.5… nguồn **[S5]**.
   - "Mượn sách thư viện tối đa bao nhiêu cuốn và trong bao lâu?" → 5 cuốn, 14 ngày, gia hạn 7 ngày **[S7]**.
   - "Tài liệu có đề cập đến học bổng du học Nhật Bản không?" → **"Không tìm thấy thông tin này trong tài liệu."** → chứng minh chatbot không bịa.
3. **Chứng minh AWS chạy thật:**
   - Lambda → tab **Monitor** → biểu đồ Invocations tăng.
   - **View CloudWatch logs** → dòng `{"event":"chat_ok","inputTokens":…,"outputTokens":…}` (chỉ log metadata, không log câu hỏi → bảo vệ dữ liệu).
   - Bedrock → hiển thị model đang dùng; dòng nhỏ dưới mỗi câu trả lời trên web cũng ghi model + thời gian xử lý.
   - Amplify → lịch sử build tự động từ GitHub.
4. **Điểm kỹ thuật để nói:** prompt chống bịa (chỉ dùng `<document>`), trích dẫn theo mã mục, IAM least-privilege (không có access key trong code), throttling API, CORS khóa domain, dễ mở rộng thành RAG đầy đủ (S3 + Bedrock Knowledge Bases).

---

## Chi phí ước tính (demo vài chục câu hỏi)

| Dịch vụ | Tính phí | Ước tính cho demo |
|---|---|---|
| Amplify Hosting | Phút build + lưu trữ + băng thông + SSR request | ~0 – 0,1 USD (vài lần build × ~3 phút) |
| API Gateway HTTP API | Theo số request | ≈ 0 (vài trăm request) |
| Lambda | Số lần gọi + GB-giây | ≈ 0 (nằm trong free tier nếu còn) |
| Bedrock Nova 2 Lite | Theo token input/output | Mỗi câu ~2.000 token input → khoảng vài phần trăm cent; 100 câu < 0,1 USD |
| CloudWatch Logs | Dung lượng log | ≈ 0 |

Giá thay đổi theo thời gian — xác nhận trên [Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) và [Amplify pricing](https://aws.amazon.com/amplify/pricing/). Model lớn (Claude Sonnet/Opus…) đắt hơn Nova Lite nhiều lần.

**Sau khi chấm điểm:** xóa API Gateway, Lambda và app Amplify (hoặc ít nhất xóa API) để không ai gọi được nữa.

---

## Xử lý sự cố

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| Web báo "Chưa cấu hình NEXT_PUBLIC_CHAT_API_URL" | Thiếu biến môi trường lúc build | Thêm biến trong `.env.local` / Amplify → Redeploy |
| `403 … AccessDenied` | Role Lambda (`Backend-role-…`) chưa có policy Bedrock | Làm lại Bước 2.5: gắn inline policy `aws/bedrock-invoke-policy.json` vào role. (Model access page của Bedrock đã bị gỡ — model tự bật khi invoke, không cần làm gì thêm.) |
| `400 Model ID hoặc Region không hợp lệ` | Sai `BEDROCK_MODEL_ID`, hoặc dùng sai prefix inference profile so với region | Prefix phải khớp region: Singapore → `apac.`, us-east-1 → `us.`. Vd ở Singapore: `apac.amazon.nova-lite-v1:0` |
| `502` / timeout | Lambda timeout 3s mặc định | Tăng Timeout lên 30s (Bước 2.3) |
| Trình duyệt báo lỗi **CORS** | Chưa cấu hình CORS hoặc origin sai | Bước 3.5; origin phải khớp đúng `https://…amplifyapp.com`, không có `/` cuối |
| `{"message":"Not Found"}` | Thiếu `/chat` cuối URL | URL phải kết thúc bằng `/chat` |
| Amplify build lỗi "Cannot find package.json" | Chưa tick monorepo | Đặt Monorepo root = `web` |
| Xem log lỗi chi tiết | — | Lambda → Monitor → View CloudWatch logs, tìm `chat_error` |

---

## Phương án dự phòng

1. **Bedrock chưa gọi được (403):** vẫn deploy Lambda + API Gateway + Amplify thật. Khi demo, câu trả lời sẽ hiện thông báo lỗi rõ ràng (403) → giải thích trung thực phần nào đã chạy, show CloudWatch log `chat_error`. Không giả lập câu trả lời AI.
2. **API Gateway mất nhiều thời gian:** Lambda → Configuration → **Function URL** → Create → Auth type `NONE` → bật CORS (origin `*`, header `content-type`, method `POST`). Dùng URL đó cho `NEXT_PUBLIC_CHAT_API_URL` (không cần thêm `/chat`). Lambda vẫn chạy y hệt.
3. **Amplify build lỗi sát giờ:** demo bằng `npm run dev` trên máy (vẫn gọi API Gateway → Lambda → Bedrock thật), nói rõ phần hosting chưa xong.
4. **Model Nova lỗi:** đổi `BEDROCK_MODEL_ID` sang model khác — bản global `global.amazon.nova-lite-v1:0`, hoặc micro `apac.amazon.nova-micro-v1:0` (nhớ giữ prefix `apac.` cho region Singapore) — không cần sửa code.

---

## Đổi tài liệu

Sửa `lambda/document.md` (giữ cấu trúc `## Tiêu đề mục` — mỗi mục là một nguồn trích dẫn), rồi:

```bash
cd lambda && npm test && npm run zip
```

Upload lại `function.zip` lên Lambda và push code để Amplify cập nhật link "Tài liệu" ở sidebar. Câu hỏi gợi ý nằm trong `web/app/page.tsx` (`SUGGESTED_QUESTIONS`). Tài liệu dưới ~12.000 ký tự được gửi nguyên văn; dài hơn thì Lambda tự chọn 4 mục liên quan nhất theo từ khóa.
