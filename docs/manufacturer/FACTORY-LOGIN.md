# Manufacturer factory login

Open https://app.bair1.live/factory in desktop Chrome or Edge. The existing /firmware#installer URL uses the same direct factory login.

Use Account A's existing email and password from the confidential guide. This login does not use Auth0, Google or an email mailbox. It only authorizes factory enrollment, device-specific upload configuration and receipt checks for the existing batch. Customer dashboards and administration retain their existing authentication.

- The same account can provision each board within its existing batch quota. Reconfiguring the same unit does not consume another place.
- A browser session lasts up to eight hours and never outlives the factory batch grant. Sign in again when it ends. Grant expiry and credential-version revocation apply immediately.
- Logging out revokes the server-side session. Passwords are salted scrypt verifiers; cookies are Secure, HttpOnly, SameSite=Strict, host-only, with random hash-only server sessions. Tokens are not placed in URLs or browser storage.
- Login attempts are limited independently of device uploads. Ten attempts per login and sixty per network in a fifteen-minute fixed window; wait for Retry-After if reached. This does not rate-limit telemetry sampling/upload.
- Factory operations retain owner/batch checks, device-bound upload keys, profile validation and current-session receipts. Creating fresh USB settings replaces the unit's previous factory upload key: actually write those fresh settings to that board before expecting uploads to resume.
- Native credentials are issued administratively against an existing ordinary factory user and approved grant; no public sign-up, grant creation or privilege escalation endpoint exists.

## 给工厂的操作说明

1. 在电脑 Chrome 或 Edge 中打开 https://app.bair1.live/factory 。
2. 输入原机密 PDF 中 Account A 的邮箱和密码，点击 **Sign in / 登录**。无需进入邮箱、使用 Google 或注册账号。
3. 登录后核对剩余设备名额，选择对应的 BME280 或 SPS30 配置。SPS30 必须符合指南中的 RevC I²C 接线。
4. 按原指南连接设备、安装匹配固件、填写 Wi-Fi，并执行 Configure and test。
5. 配置成功后检查新上传，再执行断电重启验证。退出或会话到期时，只需在此页面重新登录。
6. 重新下载配置文件会替换该设备原有的工厂上传密钥，请务必把新文件写入正确设备。不要只下载而未写入。
7. 若报错，请发送错误文字与操作时间；不要发送密码、API 密钥或私密配置 JSON。
