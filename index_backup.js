<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>محول جداول FET إلى aSc</title>
    <link rel="stylesheet" href="style.css">
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body>
    <div class="app-container">
        <header>
            <h1>محول جداول FET <span>إلى aSc Timetables</span></h1>
            <p>قم بتحويل ملفات FET إلى ملفات XML متوافقة مع برنامج aSc بخطوة واحدة</p>
            <p style="margin-top: 10px; font-weight: bold; font-size: 14px; color: var(--primary);">مطور البرنامج: أحمد حمرالعين</p>
        </header>

        <main>
            <div class="upload-area" id="drop-zone">
                <div class="upload-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                </div>
                <h2>اسحب وأفلت ملف FET هنا</h2>
                <p>أو</p>
                <label for="file-input" class="custom-file-upload">
                    اختر ملف FET
                </label>
                <input type="file" id="file-input" accept=".fet">
            </div>

            <div id="status-card" class="status-card hidden">
                <div class="loader" id="loader"></div>
                <div class="status-content">
                    <h3 id="status-title">جاري المعالجة...</h3>
                    <p id="status-message">يرجى الانتظار بينما نقوم بتحليل البيانات.</p>
                </div>
            </div>

            <div id="mapping-card" class="status-card mapping-card hidden" style="flex-direction: column; align-items: flex-start; padding: 30px;">
                <h3 style="margin-bottom: 15px; color: var(--primary); width: 100%; border-bottom: 2px solid var(--border-color); padding-bottom: 10px;">مزامنة الأيام</h3>
                
                <div class="toggle-container" style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
                    <div>
                        <h4 style="margin: 0; color: var(--text-color);">نمط أنصاف الأيام</h4>
                        <p style="margin: 5px 0 0 0; font-size: 12px; color: var(--text-muted);">عند التفعيل، سيتم نقل أيام FET (أنصاف الأيام) كما هي دون دمجها (صباحي/مسائي)</p>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="half-days-toggle">
                        <span class="slider round"></span>
                    </label>
                </div>

                <p id="mapping-instructions" style="margin-bottom: 20px; font-size: 14px; color: var(--text-muted);">قم بربط أيام ملف FET بأيام aSc والفترات (صباحي/مسائي):</p>
                
                <div id="mapping-container" style="width: 100%; margin-bottom: 20px;">
                    <!-- Mapping rows will be injected here -->
                </div>
                
                <button id="export-btn" class="download-btn" style="align-self: flex-end; background-color: var(--primary);">تأكيد وتصدير XML</button>
            </div>

            <div id="success-card" class="status-card success hidden">
                <div class="status-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div>
                <div class="status-content">
                    <h3>تم التحويل بنجاح!</h3>
                    <p>تم استخراج <span id="activities-count">0</span> نشاط. سيتم تنزيل الملف الآن.</p>
                    <button id="download-btn" class="download-btn">تنزيل الملف مجدداً</button>
                </div>
            </div>
            
            <div id="error-card" class="status-card error hidden">
                <div class="status-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                </div>
                <div class="status-content">
                    <h3>حدث خطأ</h3>
                    <p id="error-message">تأكد من أن الملف هو ملف FET صالح.</p>
                </div>
            </div>
        </main>
    </div>

    <script src="script.js"></script>
</body>
</html>
