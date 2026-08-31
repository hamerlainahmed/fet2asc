let xlsx;
try {
    xlsx = require('xlsx');
} catch (e) {
    console.warn("Could not load xlsx module", e);
}

document.addEventListener('DOMContentLoaded', () => {
    // Set dynamic version from package.json and handle release notes
    try {
        const pkg = require('./package.json');
        const versionElement = document.getElementById('app-version');
        if (versionElement && pkg && pkg.version) {
            versionElement.textContent = `الإصدار ${pkg.version}`;
            
            // Check for update to show release notes
            const lastSeenVersion = localStorage.getItem('lastSeenVersion');
            if (lastSeenVersion !== pkg.version) {
                const modal = document.getElementById('release-notes-modal');
                const closeBtn = document.getElementById('close-notes-btn');
                if (modal && closeBtn) {
                    modal.classList.remove('hidden');
                    closeBtn.addEventListener('click', () => {
                        modal.classList.add('hidden');
                        localStorage.setItem('lastSeenVersion', pkg.version);
                    });
                } else {
                    localStorage.setItem('lastSeenVersion', pkg.version);
                }
            }
        }
    } catch (e) {
        console.error("Could not load version from package.json", e);
    }
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const statusCard = document.getElementById('status-card');
    const successCard = document.getElementById('success-card');
    const errorCard = document.getElementById('error-card');
    const downloadBtn = document.getElementById('download-btn');
    const activitiesCountSpan = document.getElementById('activities-count');

    const mappingCard = document.getElementById('mapping-card');
    const mappingContainer = document.getElementById('mapping-container');
    const mappingInstructions = document.getElementById('mapping-instructions');
    const exportBtn = document.getElementById('export-btn');
    const halfDaysToggle = document.getElementById('half-days-toggle');

    const modeFet2Asc = document.getElementById('mode-fet2asc');
    const modeAsc2Fet = document.getElementById('mode-asc2fet');
    const modeHighest2Asc = document.getElementById('mode-highest2asc');
    const mode12temps2asc = document.getElementById('mode-12temps2asc');
    const dropZoneText = document.getElementById('drop-zone-text');
    const fileUploadLabel = document.getElementById('file-upload-label');

    // Highest mode DOM refs
    const highestDropZone = document.getElementById('highest-drop-zone');
    const highestFileInput = document.getElementById('highest-file-input');
    const highestFilesStatus = document.getElementById('highest-files-status');
    const highestProcessBtn = document.getElementById('highest-process-btn');

    // 12temps mode DOM refs
    const tempsDropZone = document.getElementById('12temps-drop-zone');
    const tempsFileInput = document.getElementById('12temps-file-input');

    let generatedXml = '';
    let originalFileName = '';

    let parsedData = null; // Store data temporarily before export
    let ascXmlContent = null; // Store XML content to process after mapping
    let currentMode = 'fet2asc'; // 'fet2asc', 'asc2fet', 'highest2asc', or '12temps2asc'

    // Highest mode state
    let highestFiles = { teachers: null, activities: null, subgroups: null };

    // Mode Selection Logic
    function updateModeUI() {
        if (modeFet2Asc.checked) {
            currentMode = 'fet2asc';
            dropZoneText.textContent = "اسحب وأفلت ملف FET هنا";
            fileUploadLabel.textContent = "اختر ملف FET";
            fileInput.accept = ".fet";
            fileInput.multiple = false;
            dropZone.classList.remove('hidden');
            highestDropZone.classList.add('hidden');
            if (tempsDropZone) tempsDropZone.classList.add('hidden');
        } else if (modeHighest2Asc && modeHighest2Asc.checked) {
            currentMode = 'highest2asc';
            dropZone.classList.add('hidden');
            highestDropZone.classList.remove('hidden');
            if (tempsDropZone) tempsDropZone.classList.add('hidden');
            highestFiles = { teachers: null, activities: null, subgroups: null };
            updateHighestFilesStatus();
        } else if (mode12temps2asc && mode12temps2asc.checked) {
            currentMode = '12temps2asc';
            dropZone.classList.add('hidden');
            highestDropZone.classList.add('hidden');
            if (tempsDropZone) tempsDropZone.classList.remove('hidden');
        } else {
            currentMode = 'asc2fet';
            dropZoneText.textContent = "اسحب وأفلت ملف aSc XML هنا";
            fileUploadLabel.textContent = "اختر ملف XML";
            fileInput.accept = ".xml";
            fileInput.multiple = false;
            dropZone.classList.remove('hidden');
            highestDropZone.classList.add('hidden');
            if (tempsDropZone) tempsDropZone.classList.add('hidden');
          
        }
        hideAllCards();
    }

    if (modeFet2Asc && modeAsc2Fet) {
        modeFet2Asc.addEventListener('change', updateModeUI);
        modeAsc2Fet.addEventListener('change', updateModeUI);
    }
    if (modeHighest2Asc) {
        modeHighest2Asc.addEventListener('change', updateModeUI);
    }
    if (mode12temps2asc) {
        mode12temps2asc.addEventListener('change', updateModeUI);
    }

    // --- Highest mode: file upload & drag-drop ---
    function updateHighestFilesStatus() {
        const statusTeachers = document.getElementById('status-teachers');
        const statusActivities = document.getElementById('status-activities');
        const statusSubgroups = document.getElementById('status-subgroups');
        const statusFet = document.getElementById('status-fet');

        const setStatus = (el, loaded) => {
            if (!el) return;
            const icon = el.querySelector('.file-status-icon');
            if (loaded) {
                icon.textContent = '✓';
                icon.className = 'file-status-icon done';
                el.classList.add('loaded');
            } else {
                icon.textContent = '○';
                icon.className = 'file-status-icon pending';
                el.classList.remove('loaded');
            }
        };

        setStatus(statusTeachers, !!highestFiles.teachers);
        setStatus(statusActivities, !!highestFiles.activities);
        setStatus(statusSubgroups, !!highestFiles.subgroups);
        setStatus(statusFet, !!highestFiles.fet);

        // Enable process button if at least teachers file is loaded
        const canProcess = !!highestFiles.teachers;
        highestProcessBtn.disabled = !canProcess;

        highestFilesStatus.classList.remove('hidden');
    }

    function detectHighestFileType(content, fileName) {
        if (fileName && fileName.toLowerCase().endsWith('.fet')) return 'fet';
        if (content.includes('<Teachers_Timetable>')) return 'teachers';
        if (content.includes('<Activities_Timetable>')) return 'activities';
        if (content.includes('<Students_Timetable>')) return 'subgroups';
        return null;
    }

    function handleHighestFiles(files) {
        const xmlFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.xml') || f.name.toLowerCase().endsWith('.fet'));
        if (xmlFiles.length === 0) {
            showError("الرجاء اختيار ملفات XML صالحة من مجلد highest.");
            return;
        }

        let loaded = 0;
        xmlFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const content = e.target.result;
                const type = detectHighestFileType(content, file.name);
                if (type) {
                    highestFiles[type] = { name: file.name, content };
                    if (!originalFileName && type !== 'fet') {
                        originalFileName = file.name.replace(/_?(activities|teachers|subgroups)\.xml$/i, '').replace(/\.[^/.]+$/, '');
                    }
                }
                loaded++;
                if (loaded === xmlFiles.length) {
                    updateHighestFilesStatus();
                }
            };
            reader.readAsText(file, 'UTF-8');
        });
    }

    if (highestDropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            highestDropZone.addEventListener(eventName, preventDefaults, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            highestDropZone.addEventListener(eventName, () => highestDropZone.classList.add('dragover'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            highestDropZone.addEventListener(eventName, () => highestDropZone.classList.remove('dragover'), false);
        });
        highestDropZone.addEventListener('drop', (e) => {
            handleHighestFiles(e.dataTransfer.files);
        });
    }

    if (highestFileInput) {
        highestFileInput.addEventListener('change', function() {
            handleHighestFiles(this.files);
        });
    }

    if (highestProcessBtn) {
        highestProcessBtn.addEventListener('click', () => {
            if (!highestFiles.teachers) {
                showError("يجب رفع ملف الأساتذة (teachers) على الأقل.");
                return;
            }
            hideAllCards();
            statusCard.classList.remove('hidden');
            // Use setTimeout to allow UI to update before heavy parsing
            setTimeout(() => {
                try {
                    parseHighestXMLFiles();
                } catch (error) {
                    console.error(error);
                    showError("حدث خطأ أثناء تحليل ملفات Highest: " + error.message);
                }
            }, 50);
        });
    }

    function handle12TempsFiles(files) {
        if (files.length === 0) return;
        const file = files[0];
        if (!file.name.toLowerCase().endsWith('.xls') && !file.name.toLowerCase().endsWith('.xlsx')) {
            showError("الرجاء اختيار ملف Excel صالح (xls أو xlsx).");
            return;
        }

        originalFileName = file.name.replace(/\.[^/.]+$/, "");
        hideAllCards();
        statusCard.classList.remove('hidden');

        setTimeout(() => {
            try {
                if (!xlsx) {
                    throw new Error("لم يتم تحميل مكتبة xlsx بنجاح. تأكد من تثبيتها عبر npm.");
                }
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = xlsx.read(data, {type: 'array'});
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        const jsonData = xlsx.utils.sheet_to_json(worksheet, {header: 1});
                        parse12TempsData(jsonData);
                    } catch (err) {
                        showError("حدث خطأ أثناء قراءة ملف 12temps: " + err.message);
                    }
                };
                reader.readAsArrayBuffer(file);
            } catch (error) {
                console.error(error);
                showError("حدث خطأ أثناء معالجة الملف: " + error.message);
            }
        }, 50);
    }

    if (tempsDropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            tempsDropZone.addEventListener(eventName, preventDefaults, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            tempsDropZone.addEventListener(eventName, () => tempsDropZone.classList.add('dragover'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            tempsDropZone.addEventListener(eventName, () => tempsDropZone.classList.remove('dragover'), false);
        });
        tempsDropZone.addEventListener('drop', (e) => {
            handle12TempsFiles(e.dataTransfer.files);
        });
    }

    if (tempsFileInput) {
        tempsFileInput.addEventListener('change', function() {
            handle12TempsFiles(this.files);
        });
    }

    // Drag and Drop Events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        let dt = e.dataTransfer;
        let files = dt.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', function () {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length === 0) return;

        // If in highest mode, delegate to handleHighestFiles
        if (currentMode === 'highest2asc') {
            handleHighestFiles(files);
            return;
        }
        if (currentMode === '12temps2asc') {
            handle12TempsFiles(files);
            return;
        }

        const file = files[0];

        if (currentMode === 'fet2asc' && !file.name.toLowerCase().endsWith('.fet')) {
            showError("الرجاء اختيار ملف بصيغة FET صالح.");
            return;
        }
        if (currentMode === 'asc2fet' && !file.name.toLowerCase().endsWith('.xml')) {
            showError("الرجاء اختيار ملف aSc XML صالح.");
            return;
        }

        originalFileName = file.name.replace(/\.[^/.]+$/, "");

        hideAllCards();
        statusCard.classList.remove('hidden');

        const headerReader = new FileReader();
        headerReader.onload = function (eHeader) {
            const headerText = eHeader.target.result;
            let fileEncoding = 'UTF-8';
            const match = headerText.match(/encoding=['"]([^'"]+)['"]/i);
            if (match && match[1]) {
                fileEncoding = match[1];
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    if (currentMode === 'fet2asc') {
                        parseFET(e.target.result);
                    } else {
                        ascXmlContent = e.target.result;
                        showAscToFetMapping();
                    }
                } catch (error) {
                    console.error(error);
                    showError("حدث خطأ أثناء تحليل الملف: " + error.message + "\nStack: " + error.stack);
                }
            };
            reader.readAsText(file, fileEncoding);
        };
        headerReader.readAsText(file.slice(0, 1024));
    }

    function showAscToFetMapping() {
        hideAllCards();
        statusCard.classList.add('hidden');
        mappingInstructions.textContent = "قم بربط أيام وحصص aSc الموجودة في الملف مع أيام وحصص FET الأساسية:";
        halfDaysToggle.closest('.toggle-container').style.display = 'none';

        // Parse aSc XML to get its days and periods
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(ascXmlContent, "text/xml");

        let ascDaysNodes = Array.from(xmlDoc.querySelectorAll('days day'));
        let isDaysDef = false;
        if (ascDaysNodes.length === 0) {
            ascDaysNodes = Array.from(xmlDoc.querySelectorAll('daysdefs daysdef')).filter(node => {
                const daysStr = node.getAttribute('days');
                return daysStr && (daysStr.match(/1/g) || []).length === 1;
            });
            isDaysDef = true;
        }

        const ascDays = ascDaysNodes.map(node => ({
            id: isDaysDef ? node.getAttribute('days') : (node.getAttribute('day') || node.getAttribute('id')),
            name: node.getAttribute('name') || node.getAttribute('short') || "يوم بدون اسم"
        }));

        const ascPeriods = Array.from(xmlDoc.querySelectorAll('periods period')).map(node => ({
            id: node.getAttribute('period') || node.getAttribute('id'),
            name: node.getAttribute('starttime') + "-" + node.getAttribute('endtime')
        }));

        mappingContainer.innerHTML = `
            <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 300px;">
                    <h4 style="margin-bottom: 10px; color: var(--primary);">تقسيم الأيام (أنصاف أيام)</h4>
                    <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">سيتم تقسيم كل يوم في aSc إلى نصفين في FET.</p>
                    ${ascDays.map((d) => `
                        <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 8px; border: 1px solid var(--border-color);">
                            <div style="font-weight: bold; margin-bottom: 5px; color: var(--text-color); display: flex; justify-content: space-between;">
                                <span>${d.name}</span>
                                <label style="font-weight: normal; font-size: 12px; cursor: pointer;">
                                    <input type="checkbox" class="asc-day-ignore" data-ascid="${d.id}" style="vertical-align: middle;"> تجاهل اليوم
                                </label>
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <div style="flex: 1;">
                                    <label style="font-size: 12px; color: var(--text-muted);">الفترة الصباحة:</label>
                                    <input type="text" class="asc-day-map-morning" data-ascid="${d.id}" value="${d.name} ص" style="width: 100%; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; font-family: inherit; font-size: 13px;">
                                </div>
                                <div style="flex: 1;">
                                    <label style="font-size: 12px; color: var(--text-muted);">الفترة المساءة:</label>
                                    <input type="text" class="asc-day-map-afternoon" data-ascid="${d.id}" value="${d.name} م" style="width: 100%; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; font-family: inherit; font-size: 13px;">
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div style="flex: 1; min-width: 300px;">
                    <h4 style="margin-bottom: 10px; color: var(--primary);">حصص aSc</h4>
                    <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">حدد الدوام ورقم الحصة في FET لكل حصة في aSc.</p>
                    ${ascPeriods.map((p, i) => {
            const isMorning = i < 4;
            const fetPeriodIndex = i % 4;
            return `
                        <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid var(--border-color);">
                            <span style="font-weight: 500; font-size: 14px; color: var(--text-color); min-width: 60px;">${p.name}</span>
                            <div style="display: flex; gap: 10px;">
                                <select class="asc-period-shift" data-ascid="${p.id}" style="padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; font-family: inherit; font-size: 13px;">
                                    <option value="morning" ${isMorning ? 'selected' : ''}>صباح</option>
                                    <option value="afternoon" ${!isMorning ? 'selected' : ''}>مساء</option>
                                    <option value="ignore">تجاهل</option>
                                </select>
                                <select class="asc-period-index" data-ascid="${p.id}" style="padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; font-family: inherit; font-size: 13px;">
                                    ${Array.from({ length: 4 }).map((_, pi) => `<option value="${pi}" ${fetPeriodIndex === pi ? 'selected' : ''}>الحصة ${pi + 1}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                    `}).join('')}
                </div>
            </div>
        `;
        mappingCard.classList.remove('hidden');
        mappingCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Add event listeners for ignore checkbox (days)
        const dayIgnoreCheckboxes = document.querySelectorAll('.asc-day-ignore');
        dayIgnoreCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const ascId = e.target.getAttribute('data-ascid');
                const morningInput = document.querySelector(`.asc-day-map-morning[data-ascid="${ascId}"]`);
                const afternoonInput = document.querySelector(`.asc-day-map-afternoon[data-ascid="${ascId}"]`);
                if (morningInput) morningInput.disabled = e.target.checked;
                if (afternoonInput) afternoonInput.disabled = e.target.checked;
            });
        });

        // Add event listeners for shift dropdown (periods)
        const periodShiftSelects = document.querySelectorAll('.asc-period-shift');
        periodShiftSelects.forEach(select => {
            select.addEventListener('change', (e) => {
                const ascId = e.target.getAttribute('data-ascid');
                const indexSelect = document.querySelector(`.asc-period-index[data-ascid="${ascId}"]`);
                if (indexSelect) {
                    indexSelect.disabled = (e.target.value === 'ignore');
                }
            });
            // trigger initially in case of preset state
            select.dispatchEvent(new Event('change'));
        });
    }

    function parseFET(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");

        // Dynamic subgroups detection
        const subgroupMap = {};
        const classDivisionsMap = {};
        const knownGroups = new Set();
        const groupNodes = xmlDoc.querySelectorAll('Students_List Group');
        groupNodes.forEach(groupNode => {
            const groupName = groupNode.querySelector('Name')?.textContent;
            if (groupName) {
                knownGroups.add(groupName);
                classDivisionsMap[groupName] = [];
                const subgroups = groupNode.querySelectorAll('Subgroup');
                subgroups.forEach((subNode, index) => {
                    const subName = subNode.querySelector('Name')?.textContent;
                    if (subName) {
                        subgroupMap[subName] = { baseClass: groupName, division: index + 1, name: subName };
                        classDivisionsMap[groupName].push(subName);
                    }
                });
            }
        });

        const activitiesNodes = xmlDoc.querySelectorAll('Activity');
        const activities = [];

        const teachersSet = new Set();
        const subjectsSet = new Set();
        const classesSet = new Set();

        activitiesNodes.forEach(node => {
            const activeNode = node.querySelector('Active');
            if (activeNode && activeNode.textContent.trim().toLowerCase() === 'false') return;

            const id = node.querySelector('Id')?.textContent;
            const teachers = Array.from(node.querySelectorAll('Teacher')).map(t => t.textContent).filter(Boolean);
            const subject = node.querySelector('Subject')?.textContent || '';
            const studentsList = Array.from(node.querySelectorAll('Students')).map(s => s.textContent).filter(Boolean);
            const duration = parseInt(node.querySelector('Duration')?.textContent || '1');

            teachers.forEach(t => teachersSet.add(t));
            if (subject) subjectsSet.add(subject);

            let parsedStudents = [];

            studentsList.forEach(students => {
                let baseClass = students;
                let division = 0; // 0: entire, 1: group 1, etc.

                if (subgroupMap[students]) {
                    baseClass = subgroupMap[students].baseClass;
                    division = subgroupMap[students].division;
                } else if (knownGroups.size > 0) {
                    // If Students_List was parsed successfully, trust it and skip fallback logic
                    // to prevent false positives for group names like '3أف1' containing 'ف1'.
                    baseClass = students;
                    division = 0;
                } else {
                    // Fallback for custom names only if Students_List is missing

                    if (students.includes('_ف1') || students.includes('_Ý1') || students.includes('G1') || students.includes('ف1')) {
                        baseClass = students.replace('_ف1', '').replace('_Ý1', '').replace('G1', '').replace('ف1', '').trim();
                        if (baseClass.endsWith('_')) baseClass = baseClass.slice(0, -1);
                        division = 1;
                    } else if (students.includes('_ف2') || students.includes('_Ý2') || students.includes('G2') || students.includes('ف2')) {
                        baseClass = students.replace('_ف2', '').replace('_Ý2', '').replace('G2', '').replace('ف2', '').trim();
                        if (baseClass.endsWith('_')) baseClass = baseClass.slice(0, -1);
                        division = 2;
                    }
                    if (division > 0) {
                        if (!classDivisionsMap[baseClass]) classDivisionsMap[baseClass] = [];
                        if (!classDivisionsMap[baseClass][division - 1]) {
                            classDivisionsMap[baseClass][division - 1] = students;
                        }
                    }
                }

                if (baseClass) {
                    classesSet.add(baseClass);
                    parsedStudents.push({ baseClass, division });
                }
            });

            activities.push({
                id, teachers, subject, parsedStudents, duration
            });
        });

        const timeNodes = xmlDoc.querySelectorAll('ConstraintActivityPreferredStartingTime');
        const roomNodes = xmlDoc.querySelectorAll('ConstraintActivityPreferredRoom');
        const roomsSet = new Set();

        const fetHoursList = [];
        const hoursNodes = xmlDoc.querySelectorAll('Hours_List Hour');
        hoursNodes.forEach(hourNode => {
            const name = hourNode.querySelector('Name')?.textContent;
            if (name) fetHoursList.push(name);
        });

        const timeMap = {};
        const uniqueFetDays = [];

        const dayNamesMap = {};
        const daysNodes = xmlDoc.querySelectorAll('Days_List Day');
        daysNodes.forEach(dayNode => {
            const name = dayNode.querySelector('Name')?.textContent;
            const longName = dayNode.querySelector('Long_Name')?.textContent;
            if (name) {
                dayNamesMap[name] = longName || name;
                uniqueFetDays.push(name);
            }
        });

        timeNodes.forEach(node => {
            const actId = node.querySelector('Activity_Id')?.textContent;
            const day = node.querySelector('Day')?.textContent;
            const hour = node.querySelector('Hour')?.textContent;
            if (day && hour) {
                timeMap[actId] = { day, hour };
                if (!uniqueFetDays.includes(day)) uniqueFetDays.push(day);
            }
        });

        const roomMap = {};
        roomNodes.forEach(node => {
            const actId = node.querySelector('Activity_Id')?.textContent;
            const room = node.querySelector('Room')?.textContent;
            if (room) {
                roomMap[actId] = room;
                roomsSet.add(room);
            }
        });

        parsedData = {
            activities,
            teachersArr: Array.from(teachersSet),
            subjectsArr: Array.from(subjectsSet),
            classesArr: Array.from(classesSet),
            roomsArr: Array.from(roomsSet),
            timeMap,
            roomMap,
            uniqueFetDays,
            classDivisionsMap,
            dayNamesMap,
            fetHoursList
        };

        showMappingUI();
    }

    // =============================================
    // Highest XML Files Parser (FET Highest → aSc)
    // =============================================
    function parseHighestXMLFiles() {
        const parser = new DOMParser();

        const activitiesMap = {}; // activityId -> { id, teachers, subject, students, day, hour, room, duration, hourIndex }
        const teachersSet = new Set();
        const subjectsSet = new Set();
        const classesSet = new Set();
        const roomsSet = new Set();
        const uniqueFetDays = [];
        const fetHoursSet = new Set();

        // Subgroup/division detection
        const classDivisionsMap = {};

        // If .fet file is available, parse it first to get the COMPLETE list of activities
        if (highestFiles.fet) {
            const fetXml = parser.parseFromString(highestFiles.fet.content, "text/xml");
            const activitiesNodes = fetXml.querySelectorAll('Activity');
            activitiesNodes.forEach(node => {
                const activeNode = node.querySelector('Active');
                if (activeNode && activeNode.textContent.trim().toLowerCase() === 'false') return;

                const actId = node.querySelector('Id')?.textContent;
                if (!actId) return;
                
                const teachers = Array.from(node.querySelectorAll('Teacher')).map(t => t.textContent).filter(Boolean);
                const subject = node.querySelector('Subject')?.textContent || '';
                const studentsList = Array.from(node.querySelectorAll('Students')).map(s => s.textContent).filter(Boolean);
                const duration = parseInt(node.querySelector('Duration')?.textContent || '1');
                
                teachers.forEach(t => teachersSet.add(t));
                if (subject) subjectsSet.add(subject);
                
                activitiesMap[actId] = {
                    id: actId,
                    teachers: new Set(teachers),
                    subject: subject,
                    students: new Set(studentsList),
                    day: '',
                    hour: '',
                    hourIndex: -1,
                    room: '',
                    hourSlots: [],
                    duration: duration,
                    isFromFet: true
                };
            });
        }

        // --- Parse teachers.xml (primary source) ---
        const teachersXml = parser.parseFromString(highestFiles.teachers.content, "text/xml");
        const teacherNodes = teachersXml.querySelectorAll('Teacher');

        teacherNodes.forEach(teacherNode => {
            const teacherName = teacherNode.getAttribute('name');
            if (!teacherName) return;
            teachersSet.add(teacherName);

            const dayNodes = teacherNode.querySelectorAll('Day');
            dayNodes.forEach(dayNode => {
                const dayName = dayNode.getAttribute('name');
                if (dayName && !uniqueFetDays.includes(dayName)) {
                    uniqueFetDays.push(dayName);
                }

                const hourNodes = dayNode.querySelectorAll('Hour');
                hourNodes.forEach((hourNode, hourIdx) => {
                    const hourName = hourNode.getAttribute('name');
                    if (hourName) fetHoursSet.add(hourName);

                    const activityNode = hourNode.querySelector('Activity');
                    if (!activityNode) return; // empty hour slot

                    const actId = activityNode.getAttribute('id');
                    if (!actId) return;

                    const subjectNode = hourNode.querySelector('Subject');
                    const subject = subjectNode ? subjectNode.getAttribute('name') : '';
                    if (subject) subjectsSet.add(subject);

                    const roomNode = hourNode.querySelector('Room');
                    const room = roomNode ? roomNode.getAttribute('name') : '';
                    if (room) roomsSet.add(room);

                    const studentNodes = hourNode.querySelectorAll('Students');
                    const students = [];
                    studentNodes.forEach(sNode => {
                        const sName = sNode.getAttribute('name');
                        if (sName) students.push(sName);
                    });

                    if (!activitiesMap[actId]) {
                        activitiesMap[actId] = {
                            id: actId,
                            teachers: new Set(),
                            subject: subject,
                            students: new Set(),
                            day: dayName,
                            hour: hourName,
                            hourIndex: hourIdx,
                            room: room,
                            hourSlots: [{ day: dayName, hour: hourName, hourIndex: hourIdx }]
                        };
                    } else if (activitiesMap[actId].isFromFet && activitiesMap[actId].hourSlots.length === 0) {
                        activitiesMap[actId].day = dayName;
                        activitiesMap[actId].hour = hourName;
                        activitiesMap[actId].hourIndex = hourIdx;
                        activitiesMap[actId].room = room;
                    }

                    const act = activitiesMap[actId];
                    act.teachers.add(teacherName);
                    students.forEach(s => act.students.add(s));
                    if (!act.subject && subject) act.subject = subject;
                    if (!act.room && room) act.room = room;

                    // Track consecutive hour slots for duration calculation
                    const slotKey = `${dayName}_${hourName}`;
                    const existingSlot = act.hourSlots.find(s => s.day === dayName && s.hour === hourName);
                    if (!existingSlot) {
                        act.hourSlots.push({ day: dayName, hour: hourName, hourIndex: hourIdx });
                    }
                });
            });
        });

        // --- Supplement with activities.xml if available (for timing/room fallback) ---
        if (highestFiles.activities) {
            const activitiesXml = parser.parseFromString(highestFiles.activities.content, "text/xml");
            const actNodes = activitiesXml.querySelectorAll('Activity');
            actNodes.forEach(actNode => {
                const id = actNode.querySelector('Id')?.textContent;
                if (!id) return;

                const day = actNode.querySelector('Day')?.textContent || '';
                const hour = actNode.querySelector('Hour')?.textContent || '';
                const room = actNode.querySelector('Room')?.textContent || '';

                if (room) roomsSet.add(room);
                if (day && !uniqueFetDays.includes(day)) uniqueFetDays.push(day);

                // If activity exists in map but missing day/hour, fill from activities file
                if (activitiesMap[id]) {
                    if (!activitiesMap[id].day && day) activitiesMap[id].day = day;
                    if (!activitiesMap[id].hour && hour) activitiesMap[id].hour = hour;
                    if (!activitiesMap[id].room && room) activitiesMap[id].room = room;
                }
            });
        }

        // --- Build fetHoursList (sorted) ---
        const fetHoursList = Array.from(fetHoursSet).sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.match(/\d+/)?.[0] || '0');
            return numA - numB;
        });

        // --- Calculate duration and detect subgroups ---
        const activities = [];
        const timeMap = {};
        const roomMap = {};

        for (const [actId, act] of Object.entries(activitiesMap)) {
            // Calculate duration from consecutive slots on the same day
            const slotsByDay = {};
            act.hourSlots.forEach(slot => {
                if (!slotsByDay[slot.day]) slotsByDay[slot.day] = [];
                slotsByDay[slot.day].push(slot);
            });

            let duration = act.duration || 1;
            for (const [dayKey, slots] of Object.entries(slotsByDay)) {
                const sortedSlots = slots.sort((a, b) => {
                    const idxA = fetHoursList.indexOf(a.hour);
                    const idxB = fetHoursList.indexOf(b.hour);
                    return idxA - idxB;
                });
                // Check if slots are consecutive
                if (sortedSlots.length > 1) {
                    let consecutive = true;
                    for (let i = 1; i < sortedSlots.length; i++) {
                        const prevIdx = fetHoursList.indexOf(sortedSlots[i-1].hour);
                        const currIdx = fetHoursList.indexOf(sortedSlots[i].hour);
                        if (currIdx !== prevIdx + 1) {
                            consecutive = false;
                            break;
                        }
                    }
                    if (consecutive) {
                        duration = Math.max(duration, sortedSlots.length);
                    }
                }
            }

            // Parse students into classes/subgroups
            const parsedStudents = [];
            const studentsList = Array.from(act.students);

            studentsList.forEach(students => {
                let baseClass = students;
                let division = 0;

                // Detect subgroup pattern: ClassName_ف1, ClassName_ف2
                const subgroupMatch = students.match(/^(.+)_ف(\d+)$/);
                if (subgroupMatch) {
                    baseClass = subgroupMatch[1];
                    division = parseInt(subgroupMatch[2]);

                    if (!classDivisionsMap[baseClass]) classDivisionsMap[baseClass] = [];
                    if (!classDivisionsMap[baseClass][division - 1]) {
                        classDivisionsMap[baseClass][division - 1] = students;
                    }
                }

                classesSet.add(baseClass);
                parsedStudents.push({ baseClass, division });
            });

            activities.push({
                id: actId,
                teachers: Array.from(act.teachers),
                subject: act.subject,
                parsedStudents,
                duration
            });

            // Build timeMap and roomMap
            if (act.day && act.hour) {
                timeMap[actId] = { day: act.day, hour: act.hour };
            }
            if (act.room) {
                roomMap[actId] = act.room;
            }
        }

        // --- Build dayNamesMap ---
        const dayNamesMap = {};
        uniqueFetDays.forEach(day => {
            dayNamesMap[day] = day; // In highest export, the day name is already the long name
        });

        // --- Store parsed data (same structure as parseFET) ---
        parsedData = {
            activities,
            teachersArr: Array.from(teachersSet),
            subjectsArr: Array.from(subjectsSet),
            classesArr: Array.from(classesSet),
            roomsArr: Array.from(roomsSet),
            timeMap,
            roomMap,
            uniqueFetDays,
            classDivisionsMap,
            dayNamesMap,
            fetHoursList
        };

        showMappingUI();
    }

    // =============================================
    // 12temps Parser (12temps → aSc)
    // =============================================
    function parse12TempsData(data) {
        const activitiesMap = {};
        const teachersSet = new Set();
        const subjectsSet = new Set();
        const classesSet = new Set();
        const roomsSet = new Set();
        const uniqueFetDays = [];
        const fetHoursSet = new Set();
        const classDivisionsMap = {};

        // Row 0 is header: [ 'Jour', 'Heure', 'Classe', 'Matière', 'Professeur', 'Salle', 'Groupe', 'Regroup', 'Eff', 'Mo', 'Freq', 'Aire' ]
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < 5) continue;

            const dayName = row[0];
            const hourName = row[1];
            const rawClass = row[2];
            const subject = row[3];
            const teacher = row[4];
            const room = row[5] || '';
            const groupe = row[6]; // 'A', 'B', etc. or undefined for whole class
            const freq = row[10]; // e.g. 't1', 't2', 't3'

            if (!dayName || !hourName || !rawClass || !subject || !teacher) continue;

            if (!uniqueFetDays.includes(dayName)) uniqueFetDays.push(dayName);
            fetHoursSet.add(hourName);
            teachersSet.add(teacher);
            subjectsSet.add(subject);
            if (room) roomsSet.add(room);

            // Determine division
            let division = 0;
            if (groupe === 'A') division = 1;
            else if (groupe === 'B') division = 2;
            else if (groupe === 'C') division = 3;

            const baseClass = rawClass;
            classesSet.add(baseClass);
            
            // Determine term
            let term = 0;
            if (freq) {
                const f = String(freq).trim().toLowerCase();
                if (f === 't1') term = 1;
                else if (f === 't2') term = 2;
                else if (f === 't3') term = 3;
            }
            
            if (division > 0) {
                if (!classDivisionsMap[baseClass]) classDivisionsMap[baseClass] = [];
                // Format the parsed student string exactly as fet2asc handles it
                if (!classDivisionsMap[baseClass][division - 1]) {
                    classDivisionsMap[baseClass][division - 1] = `${baseClass}_ف${division}`;
                }
            }

            // Create a unique key for grouping consecutive hours
            const actKey = `${teacher}|${subject}|${baseClass}|${division}|${room}|${term}`;
            
            if (!activitiesMap[actKey]) {
                activitiesMap[actKey] = {
                    teachers: new Set([teacher]),
                    subject: subject,
                    students: new Set(),
                    parsedStudents: [],
                    room: room,
                    term: term,
                    hourSlots: []
                };
            }

            const act = activitiesMap[actKey];
            act.hourSlots.push({ day: dayName, hour: hourName });
            
            // Add student reference
            const studentRef = division > 0 ? `${baseClass}_ف${division}` : baseClass;
            if (!act.students.has(studentRef)) {
                act.students.add(studentRef);
                act.parsedStudents.push({ baseClass, division });
            }
        }

        const fetHoursList = Array.from(fetHoursSet).sort((a, b) => {
            const numA = parseInt(a.match(/\\d+/)?.[0] || '0');
            const numB = parseInt(b.match(/\\d+/)?.[0] || '0');
            return numA - numB;
        });

        const activities = [];
        const timeMap = {};
        const roomMap = {};
        let actIdCounter = 1;

        // Group into activities
        for (const [key, act] of Object.entries(activitiesMap)) {
            const slotsByDay = {};
            act.hourSlots.forEach(slot => {
                if (!slotsByDay[slot.day]) slotsByDay[slot.day] = [];
                slotsByDay[slot.day].push(slot);
            });

            for (const [dayKey, slots] of Object.entries(slotsByDay)) {
                // Sort slots by hour index
                const sortedSlots = slots.sort((a, b) => {
                    return fetHoursList.indexOf(a.hour) - fetHoursList.indexOf(b.hour);
                });

                // Group consecutive slots
                let currentGroup = [sortedSlots[0]];
                for (let i = 1; i < sortedSlots.length; i++) {
                    const prevIdx = fetHoursList.indexOf(sortedSlots[i-1].hour);
                    const currIdx = fetHoursList.indexOf(sortedSlots[i].hour);
                    if (currIdx === prevIdx + 1) {
                        currentGroup.push(sortedSlots[i]);
                    } else {
                        // Output previous group
                        const actId = `12temps_${actIdCounter++}`;
                        activities.push({
                            id: actId,
                            teachers: Array.from(act.teachers),
                            subject: act.subject,
                            parsedStudents: act.parsedStudents,
                            duration: currentGroup.length,
                            term: act.term
                        });
                        timeMap[actId] = { day: dayKey, hour: currentGroup[0].hour };
                        if (act.room) roomMap[actId] = act.room;

                        currentGroup = [sortedSlots[i]];
                    }
                }
                
                // Output last group
                if (currentGroup.length > 0) {
                    const actId = `12temps_${actIdCounter++}`;
                    activities.push({
                        id: actId,
                        teachers: Array.from(act.teachers),
                        subject: act.subject,
                        parsedStudents: act.parsedStudents,
                        duration: currentGroup.length,
                        term: act.term
                    });
                    timeMap[actId] = { day: dayKey, hour: currentGroup[0].hour };
                    if (act.room) roomMap[actId] = act.room;
                }
            }
        }

        const dayNamesMap = {};
        uniqueFetDays.forEach(day => { dayNamesMap[day] = day; });

        parsedData = {
            activities,
            teachersArr: Array.from(teachersSet),
            subjectsArr: Array.from(subjectsSet),
            classesArr: Array.from(classesSet),
            roomsArr: Array.from(roomsSet),
            timeMap,
            roomMap,
            uniqueFetDays,
            classDivisionsMap,
            dayNamesMap,
            fetHoursList
        };

        showMappingUI();
    }
    
    function showMappingUI() {
        hideAllCards();
        mappingContainer.innerHTML = '';

        const isHalfDaysMode = halfDaysToggle.checked;

        if (isHalfDaysMode) {
            if (mappingInstructions) mappingInstructions.textContent = "تتم المزامنة بين أنصاف الأيام في ملف FET والأيام في aSc (من اليوم 1 إلى اليوم 14):";

            parsedData.uniqueFetDays.forEach((fetDay, i) => {
                const row = document.createElement('div');
                row.className = 'mapping-row';
                const longName = parsedData.dayNamesMap ? (parsedData.dayNamesMap[fetDay] || fetDay) : fetDay;

                let options = '';
                for (let d = 0; d < 14; d++) {
                    options += `<option value="${d}" ${d === i ? 'selected' : ''}>اليوم ${d + 1}</option>`;
                }

                row.innerHTML = `
                    <div class="mapping-label">
                        <label class="custom-checkbox">
                            <input type="checkbox" class="fet-day-export-toggle" data-fetday="${fetDay}" checked>
                            <span class="checkmark"></span>
                            ${fetDay} ${longName && longName !== fetDay ? `(${longName})` : ''}
                        </label>
                    </div>
                    <div class="mapping-selects">
                        <select class="mapping-select half-day-select" data-fetday="${fetDay}">
                            ${options}
                        </select>
                    </div>
                `;
                mappingContainer.appendChild(row);
            });
        } else {
            if (mappingInstructions) mappingInstructions.textContent = "قم بربط أيام ملف FET بأيام aSc والفترات (صباح/مساء):";

            const ascDays = [
                { val: 0, label: "السبت (SAM)", match: ['سبت', 'sam'] },
                { val: 1, label: "الأحد (DIM)", match: ['أحد', 'احد', 'dim'] },
                { val: 2, label: "الإثنين (LUN)", match: ['إثنين', 'اثنين', 'lun'] },
                { val: 3, label: "الثلاثاء (MAR)", match: ['ثلاثاء', 'mar'] },
                { val: 4, label: "الأربعاء (MER)", match: ['أربعاء', 'اربعاء', 'mer'] },
                { val: 5, label: "الخميس (JEU)", match: ['خميس', 'jeu'] },
                { val: 6, label: "الجمعة (VEN)", match: ['جمعة', 'ven'] }
            ];

            parsedData.uniqueFetDays.forEach(fetDay => {
                const row = document.createElement('div');
                row.className = 'mapping-row';

                const longName = parsedData.dayNamesMap ? (parsedData.dayNamesMap[fetDay] || fetDay) : fetDay;
                const searchStr = longName + " " + fetDay;
                const searchStrLower = searchStr.toLowerCase();

                // Try to guess default mapping
                let defaultDay = 1; // Default to Sunday
                for (const d of ascDays) {
                    if (d.match.some(k => searchStrLower.includes(k))) {
                        defaultDay = d.val;
                        break;
                    }
                }

                let defaultShift = (searchStr.includes(' م') || searchStr.endsWith('م') || searchStr.includes('مساء')) ? 1 : 0;

                row.innerHTML = `
                    <div class="mapping-label">
                        <label class="custom-checkbox">
                            <input type="checkbox" class="fet-day-export-toggle" data-fetday="${fetDay}" checked>
                            <span class="checkmark"></span>
                            ${fetDay} ${longName && longName !== fetDay ? `(${longName})` : ''}
                        </label>
                    </div>
                    <div class="mapping-selects">
                        <select class="mapping-select day-select" data-fetday="${fetDay}">
                            ${ascDays.map(d => `<option value="${d.val}" ${d.val === defaultDay ? 'selected' : ''}>${d.label}</option>`).join('')}
                        </select>
                        ${currentMode === '12temps2asc' ? '' : `
                        <select class="mapping-select shift-select" data-fetday="${fetDay}">
                            <option value="0" ${defaultShift === 0 ? 'selected' : ''}>صباح (الحصص 1-4)</option>
                            <option value="1" ${defaultShift === 1 ? 'selected' : ''}>مساء (الحصص 5-8)</option>
                        </select>
                        `}
                    </div>
                `;
                mappingContainer.appendChild(row);
            });
        }

        // Add listeners for checkboxes to toggle 'disabled' class on the row
        const exportToggles = document.querySelectorAll('.fet-day-export-toggle');
        exportToggles.forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const row = e.target.closest('.mapping-row');
                if (e.target.checked) {
                    row.classList.remove('disabled');
                } else {
                    row.classList.add('disabled');
                }
            });
        });

        mappingCard.classList.remove('hidden');
        mappingCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    halfDaysToggle.addEventListener('change', () => {
        showMappingUI();
    });

    exportBtn.addEventListener('click', () => {
        if (currentMode === 'fet2asc' || currentMode === 'highest2asc' || currentMode === '12temps2asc') {
            const isHalfDaysMode = halfDaysToggle.checked;

            const dayConfig = {};

            if (isHalfDaysMode) {
                const selects = document.querySelectorAll('.half-day-select');
                for (let i = 0; i < selects.length; i++) {
                    const fetDay = selects[i].getAttribute('data-fetday');
                    const checkbox = document.querySelector(`.fet-day-export-toggle[data-fetday="${fetDay}"]`);
                    if (checkbox && checkbox.checked) {
                        dayConfig[fetDay] = parseInt(selects[i].value);
                    }
                }
            } else {
                const daySelects = document.querySelectorAll('.day-select');
                const shiftSelects = document.querySelectorAll('.shift-select');

                for (let i = 0; i < daySelects.length; i++) {
                    const fetDay = daySelects[i].getAttribute('data-fetday');
                    const checkbox = document.querySelector(`.fet-day-export-toggle[data-fetday="${fetDay}"]`);
                    if (checkbox && checkbox.checked) {
                        const mappedDay = parseInt(daySelects[i].value);
                        const shiftSelect = shiftSelects[i];
                        const mappedShift = shiftSelect ? parseInt(shiftSelect.value) : 0; // 0=Morning, 1=Afternoon
                        dayConfig[fetDay] = { day: mappedDay, shift: mappedShift };
                    }
                }
            }

            generateAscXml(dayConfig, isHalfDaysMode);
        } else if (currentMode === 'asc2fet') {
            const customMapping = { days: {}, periods: {} };

            const ascDaysNodes = document.querySelectorAll('.asc-day-map-morning');
            ascDaysNodes.forEach(node => {
                const ascId = node.getAttribute('data-ascid');
                const ignoreCheckbox = document.querySelector(`.asc-day-ignore[data-ascid="${ascId}"]`);
                if (ignoreCheckbox && ignoreCheckbox.checked) {
                    customMapping.days[ascId] = { ignore: true };
                } else {
                    const morningVal = node.value.trim();
                    const afternoonNode = document.querySelector(`.asc-day-map-afternoon[data-ascid="${ascId}"]`);
                    const afternoonVal = afternoonNode ? afternoonNode.value.trim() : morningVal;

                    customMapping.days[ascId] = {
                        morning: morningVal,
                        afternoon: afternoonVal
                    };
                }
            });

            const periodShiftSelects = document.querySelectorAll('.asc-period-shift');
            periodShiftSelects.forEach(select => {
                const ascId = select.getAttribute('data-ascid');
                const shift = select.value;
                const indexSelect = document.querySelector(`.asc-period-index[data-ascid="${ascId}"]`);
                const fetIndex = indexSelect ? parseInt(indexSelect.value) : 0;

                customMapping.periods[ascId] = {
                    shift: shift,
                    fetIndex: fetIndex
                };
            });

            parseAscXml(ascXmlContent, customMapping);
        }
    });

    function generateAscXml(dayConfig, isHalfDaysMode) {
        const { activities, teachersArr, subjectsArr, classesArr, roomsArr, timeMap, roomMap, classDivisionsMap, uniqueFetDays, dayNamesMap, fetHoursList } = parsedData;

        const validActivities = activities.filter(act => {
            const time = timeMap[act.id];
            if (time && time.day) {
                return dayConfig[time.day] !== undefined;
            }
            return true; // Export open (unlocked) activities
        });

        const teacherId = (name) => `*${teachersArr.indexOf(name) + 1}`;
        const subjectId = (name) => `*${subjectsArr.indexOf(name) + 1}`;
        const classIdNum = (name) => classesArr.indexOf(name) + 1;
        const classIdStr = (name) => `*${classIdNum(name)}`;
        const roomId = (name) => `*${roomsArr.indexOf(name) + 1}`;

        // Build aSc XML String
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<timetable ascttversion="2010.3.1" importtype="database" options="idprefix:XML,groupstype1,decimalseparatordot" defaultexport="1">\n`;

        let ascDayOutputMap = {};

        // Days
        xml += `<days options="canadd" columns="day,name,short">\n`;
        if (isHalfDaysMode) {
            let maxDay = 0;
            Object.values(dayConfig).forEach(val => {
                if (val > maxDay) maxDay = val;
            });
            for (let i = 0; i <= maxDay; i++) {
                const name = `اليوم ${i + 1}`;
                xml += `<day day="${i}" short="J${i + 1}" name="${name}"/>\n`;
            }
        } else {
            const usedDays = new Set(Object.values(dayConfig).map(c => c.day));
            let hasFriday = usedDays.has(6);
            let dayOutputIndex = 0;

            if (hasFriday) {
                const dayNames = ["الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
                const dayShorts = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM"];
                const dayVals = [2, 3, 4, 5, 6, 0];
                for (let i = 0; i < 6; i++) {
                    if (usedDays.has(dayVals[i])) {
                        xml += `<day day="${dayOutputIndex}" short="${dayShorts[i]}" name="${dayNames[i]}"/>\n`;
                        ascDayOutputMap[dayVals[i]] = dayOutputIndex;
                        dayOutputIndex++;
                    }
                }
            } else {
                const dayNames = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
                const dayShorts = ["SAM", "DIM", "LUN", "MAR", "MER", "JEU"];
                const dayVals = [0, 1, 2, 3, 4, 5];
                for (let i = 0; i < 6; i++) {
                    if (usedDays.has(dayVals[i])) {
                        xml += `<day day="${dayOutputIndex}" short="${dayShorts[i]}" name="${dayNames[i]}"/>\n`;
                        ascDayOutputMap[dayVals[i]] = dayOutputIndex;
                        dayOutputIndex++;
                    }
                }
            }
        }
        xml += `</days>\n`;

        // Periods (Standard 1 to 8, + 0 for 7:00. If half-days mode, only 4 periods)
        xml += `<periods options="canadd" columns="period,starttime,endtime">\n`;
        const maxPeriods = isHalfDaysMode ? 4 : 8;
        for (let i = 0; i <= maxPeriods; i++) {
            xml += `<period period="${i}" starttime="${7 + i}:00" endtime="${8 + i}:00"/>\n`;
        }
        xml += `</periods>\n`;
        xml += `<dayperiods options="canadd" columns="day,period,starttime,endtime"/>\n`;

        const hasTerms = (currentMode === '12temps2asc');

        if (hasTerms) {
            // Terms
            xml += `<termsdefs options="canadd" columns="id,terms,name,short">\n`;
            xml += `   <termsdef id="*1" name="أي فصل دراسي" short="أي" terms="100,010,001"/>\n`;
            xml += `   <termsdef id="*2" name="الفصل الأول" short="ف1" terms="100"/>\n`;
            xml += `   <termsdef id="*3" name="الفصل الثاني" short="ف2" terms="010"/>\n`;
            xml += `   <termsdef id="*4" name="الفصل الثالث" short="ف3" terms="001"/>\n`;
            xml += `   <termsdef id="*5" name="كل الفصول" short="كل" terms="111"/>\n`;
            xml += `</termsdefs>\n`;
        }

        // Teachers
        xml += `<teachers options="canadd" columns="id,name,short,gender,color">\n`;
        teachersArr.forEach(t => {
            xml += `<teacher id="${teacherId(t)}" short="${t}" name="${t}" color="" gender=""/>\n`;
        });
        xml += `</teachers>\n`;

        // Classes
        xml += `<classes options="canadd" columns="id,name,short,classroomids,teacherid,grade">\n`;
        classesArr.forEach(c => {
            xml += `<class id="${classIdStr(c)}" short="${c}" name="${c}" grade="" classroomids="" teacherid=""/>\n`;
        });
        xml += `</classes>\n`;

        // Subjects
        xml += `<subjects options="canadd" columns="id,name,short">\n`;
        subjectsArr.forEach(s => {
            xml += `<subject id="${subjectId(s)}" short="${s}" name="${s}"/>\n`;
        });
        xml += `</subjects>\n`;

        // Classrooms
        xml += `<classrooms options="canadd" columns="id,name,short">\n`;
        roomsArr.forEach(r => {
            xml += `<classroom id="${roomId(r)}" short="${r}" name="${r}"/>\n`;
        });
        xml += `</classrooms>\n`;

        xml += `<students options="canadd" columns="id,classid,name"/>\n`;

        // Groups
        xml += `<groups options="canadd" columns="id,classid,name,entireclass,divisiontag,studentcount">\n`;
        classesArr.forEach(c => {
            let cIdNum = classIdNum(c);
            xml += `<group id="*${cIdNum * 10}" name="القسم كامل" studentcount="" divisiontag="0" entireclass="1" classid="${classIdStr(c)}"/>\n`;

            const divs = classDivisionsMap[c] || [];
            if (divs.length === 0) {
                xml += `<group id="*${cIdNum * 10 + 1}" name="فوج 1" studentcount="" divisiontag="1" entireclass="0" classid="${classIdStr(c)}"/>\n`;
                xml += `<group id="*${cIdNum * 10 + 2}" name="فوج 2" studentcount="" divisiontag="1" entireclass="0" classid="${classIdStr(c)}"/>\n`;
            } else {
                divs.forEach((subName, idx) => {
                    if (subName) {
                        xml += `<group id="*${cIdNum * 10 + idx + 1}" name="${subName}" studentcount="" divisiontag="1" entireclass="0" classid="${classIdStr(c)}"/>\n`;
                    }
                });
            }
        });
        xml += `</groups>\n`;

        // Lessons
        let lessonColumns = "id,subjectid,classids,groupids,studentids,teacherids,classroomids,periodspercard,periodsperweek,weeks";
        if (hasTerms) lessonColumns += ",termsdefid";
        xml += `<lessons options="canadd" columns="${lessonColumns}">\n`;
        validActivities.forEach(act => {
            if (!act.parsedStudents || act.parsedStudents.length === 0) return;

            let rId = roomMap[act.id] ? roomId(roomMap[act.id]) : "";
            let tId = act.teachers ? act.teachers.map(t => teacherId(t)).join(",") : "";
            let sId = act.subject ? subjectId(act.subject) : "";

            let cId = act.parsedStudents.map(ps => classIdStr(ps.baseClass)).join(",");
            let gId = act.parsedStudents.map(ps => {
                let cIdNum = classIdNum(ps.baseClass);
                if (ps.division > 0) return `*${cIdNum * 10 + ps.division}`;
                else return `*${cIdNum * 10}`; // Entire class
            }).join(",");

            let termsDefId = "*5"; // Default to all terms
            if (act.term === 1) termsDefId = "*2";
            else if (act.term === 2) termsDefId = "*3";
            else if (act.term === 3) termsDefId = "*4";

            let termsAttr = hasTerms ? ` termsdefid="${termsDefId}"` : "";

            xml += `<lesson id="*${act.id}" classroomids="${rId}" weeks="1"${termsAttr} studentids="" groupids="${gId}" teacherids="${tId}" periodsperweek="1.0" periodspercard="${act.duration}" subjectid="${sId}" classids="${cId}"/>\n`;
        });
        xml += `</lessons>\n`;

        // Cards
        let cardsColumns = "lessonid,day,period,classroomids";
        if (hasTerms) cardsColumns += ",terms";
        xml += `<cards options="canadd" columns="${cardsColumns}">\n`;
        validActivities.forEach(act => {
            const time = timeMap[act.id];
            if (time && time.day && time.hour) {
                let h = 1;
                if (fetHoursList && fetHoursList.length > 0) {
                    const idx = fetHoursList.indexOf(time.hour);
                    if (idx !== -1) {
                        h = idx + 1;
                    }
                }
                if (h === 1 && (!fetHoursList || fetHoursList.indexOf(time.hour) === -1)) {
                    let hMatch = time.hour.match(/\d+/);
                    if (hMatch) h = parseInt(hMatch[0]);
                }

                let rId = roomMap[act.id] ? roomId(roomMap[act.id]) : "";

                let termStr = "111"; // Default to all terms
                if (act.term === 1) termStr = "100";
                else if (act.term === 2) termStr = "010";
                else if (act.term === 3) termStr = "001";

                let cardTermsAttr = hasTerms ? ` terms="${termStr}"` : "";

                if (isHalfDaysMode) {
                    let mappedDay = dayConfig[time.day];
                    if (mappedDay !== undefined) {
                        xml += `<card day="${mappedDay}" period="${h}"${cardTermsAttr} classroomids="${rId}" lessonid="*${act.id}"/>\n`;
                    }
                } else {
                    let conf = dayConfig[time.day];
                    if (conf) {
                        let p = h;
                        if (currentMode !== '12temps2asc' && conf.shift === 1) p = h + 4; // Shift afternoon to period 5-8
                        let outputDay = ascDayOutputMap[conf.day];
                        if (outputDay !== undefined) {
                            xml += `<card day="${outputDay}" period="${p}"${cardTermsAttr} classroomids="${rId}" lessonid="*${act.id}"/>\n`;
                        }
                    }
                }
            }
        });
        xml += `</cards>\n`;

        // Grades
        xml += `<grades options="canadd" columns="id,name,short,grade">\n`;
        for (let i = 1; i <= 20; i++) {
            xml += `<grade id="*${i}" short="${i}" name="${i}" grade="${i}"/>\n`;
        }
        xml += `</grades>\n`;

        xml += `</timetable>`;

        generatedXml = xml;

        // Show success
        hideAllCards();
        activitiesCountSpan.textContent = validActivities.length;
        successCard.classList.remove('hidden');
        triggerDownload("ASC");
    }

    function parseAscXml(xmlString, customMapping) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");

        let daysNodes = Array.from(xmlDoc.querySelectorAll('days day'));
        let isDaysDef = false;
        if (daysNodes.length === 0) {
            daysNodes = Array.from(xmlDoc.querySelectorAll('daysdefs daysdef')).filter(node => {
                const daysStr = node.getAttribute('days');
                return daysStr && (daysStr.match(/1/g) || []).length === 1;
            });
            isDaysDef = true;
        }

        const days = daysNodes.map(node => ({
            id: isDaysDef ? node.getAttribute('days') : (node.getAttribute('day') || node.getAttribute('id')),
            name: node.getAttribute('name') || node.getAttribute('short') || "يوم بدون اسم"
        }));

        const periods = Array.from(xmlDoc.querySelectorAll('periods period')).map(node => ({
            id: node.getAttribute('period'),
            name: node.getAttribute('starttime') + "-" + node.getAttribute('endtime')
        }));

        const teachers = Array.from(xmlDoc.querySelectorAll('teachers teacher')).map(node => ({
            id: node.getAttribute('id'),
            name: node.getAttribute('short') || node.getAttribute('name')
        }));

        const subjects = Array.from(xmlDoc.querySelectorAll('subjects subject')).map(node => ({
            id: node.getAttribute('id'),
            name: node.getAttribute('short') || node.getAttribute('name')
        }));

        const classes = Array.from(xmlDoc.querySelectorAll('classes class')).map(node => ({
            id: node.getAttribute('id'),
            name: node.getAttribute('short') || node.getAttribute('name')
        }));

        const classrooms = Array.from(xmlDoc.querySelectorAll('classrooms classroom')).map(node => ({
            id: node.getAttribute('id'),
            name: node.getAttribute('short') || node.getAttribute('name')
        }));

        const groups = Array.from(xmlDoc.querySelectorAll('groups group')).map(node => ({
            id: node.getAttribute('id'),
            classid: node.getAttribute('classid'),
            name: node.getAttribute('name'),
            entireclass: node.getAttribute('entireclass') === '1'
        }));

        const lessons = Array.from(xmlDoc.querySelectorAll('lessons lesson')).map(node => ({
            id: node.getAttribute('id'),
            subjectid: node.getAttribute('subjectid'),
            teacherids: node.getAttribute('teacherids'),
            classids: node.getAttribute('classids'),
            groupids: node.getAttribute('groupids'),
            classroomids: node.getAttribute('classroomids'),
            periodspercard: parseInt(node.getAttribute('periodspercard') || '1')
        }));

        const cards = Array.from(xmlDoc.querySelectorAll('cards card')).map(node => ({
            lessonid: node.getAttribute('lessonid'),
            day: node.getAttribute('day') || node.getAttribute('days'),
            period: node.getAttribute('period'),
            classroomids: node.getAttribute('classroomids')
        }));

        const parsedAscData = {
            days, periods, teachers, subjects, classes, classrooms, groups, lessons, cards, customMapping
        };

        generateFetXml(parsedAscData);
    }

    function generateFetXml(data) {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<fet version="6.28.2">\n`;
        xml += `<Mode>Mornings_Afternoons</Mode>\n`;
        xml += `<Institution_Name>Generated by fet2asc (asc2fet mode)</Institution_Name>\n`;
        xml += `<Comments>Converted from aSc XML</Comments>\n`;

        // Hours
        xml += `<Hours_List>\n`;
        xml += `<Number>4</Number>\n`;
        for (let i = 1; i <= 4; i++) {
            xml += `<Name>الحصة ${i}</Name>\n`;
        }
        xml += `</Hours_List>\n`;

        // Days
        xml += `<Days_List>\n`;
        const fetDaysList = [];
        if (data.customMapping && data.customMapping.days) {
            data.days.forEach(d => {
                const dayMap = data.customMapping.days[d.id];
                if (dayMap) {
                    if (!dayMap.ignore) {
                        fetDaysList.push(dayMap.morning);
                        fetDaysList.push(dayMap.afternoon);
                    }
                } else {
                    fetDaysList.push(d.name + ' ص');
                    fetDaysList.push(d.name + ' م');
                }
            });
        } else {
            for (let i = 1; i <= 14; i++) {
                fetDaysList.push(`اليوم ${i}`);
            }
        }

        xml += `<Number>${fetDaysList.length}</Number>\n`;
        fetDaysList.forEach(dayName => {
            xml += `<Name>${dayName}</Name>\n`;
        });
        xml += `</Days_List>\n`;

        // Students
        xml += `<Students_List>\n`;
        const yearsMap = {};
        data.classes.forEach(c => {
            const yearName = `السنة_${c.name.charAt(0)}`;
            if (!yearsMap[yearName]) {
                yearsMap[yearName] = [];
            }
            yearsMap[yearName].push(c);
        });

        for (const [yearName, classesInYear] of Object.entries(yearsMap)) {
            xml += `<Year>\n`;
            xml += `<Name>${yearName}</Name>\n<Number_of_Students>${classesInYear.length * 30}</Number_of_Students>\n`;

            classesInYear.forEach(c => {
                const classGroups = data.groups.filter(g => g.classid === c.id);

                xml += `<Group>\n`;
                xml += `<Name>${c.name}</Name>\n<Number_of_Students>30</Number_of_Students>\n`;

                classGroups.forEach(g => {
                    if (!g.entireclass) {
                        xml += `<Subgroup>\n`;
                        xml += `<Name>${c.name}_${g.name}</Name>\n<Number_of_Students>15</Number_of_Students>\n`;
                        xml += `</Subgroup>\n`;
                    }
                });
                xml += `</Group>\n`;
            });
            xml += `</Year>\n`;
        }
        xml += `</Students_List>\n`;

        // Teachers
        xml += `<Teachers_List>\n`;
        data.teachers.forEach(t => {
            xml += `<Teacher>\n`;
            xml += `<Name>${t.name}</Name>\n`;
            xml += `<Target_Number_of_Hours>0</Target_Number_of_Hours>\n`;
            xml += `<Qualified_Subjects></Qualified_Subjects>\n`;
            xml += `<Comments></Comments>\n`;
            xml += `<Mornings_Afternoons_Behavior>Unrestricted</Mornings_Afternoons_Behavior>\n`;
            xml += `</Teacher>\n`;
        });
        xml += `</Teachers_List>\n`;

        // Subjects
        xml += `<Subjects_List>\n`;
        data.subjects.forEach(s => {
            xml += `<Subject>\n<Name>${s.name}</Name>\n</Subject>\n`;
        });
        xml += `</Subjects_List>\n`;

        // Rooms
        xml += `<Rooms_List>\n`;
        data.classrooms.forEach(r => {
            xml += `<Room>\n<Name>${r.name}</Name>\n<Capacity>40</Capacity>\n</Room>\n`;
        });
        xml += `</Rooms_List>\n`;

        let activitiesXml = `<Activities_List>\n`;
        let timeConstraintsXml = `<Time_Constraints_List>\n<ConstraintBasicCompulsoryTime>\n<Weight_Percentage>100</Weight_Percentage>\n</ConstraintBasicCompulsoryTime>\n`;
        let spaceConstraintsXml = `<Space_Constraints_List>\n<ConstraintBasicCompulsorySpace>\n<Weight_Percentage>100</Weight_Percentage>\n</ConstraintBasicCompulsorySpace>\n`;

        let activityCounter = 1;

        const getDayIndex = (id) => data.days.findIndex(x => x.id === id);
        const getPeriodIndex = (id) => data.periods.findIndex(x => x.id === id);
        const getTeacherName = (id) => { const t = data.teachers.find(x => x.id === id); return t ? t.name : ''; };
        const getSubjectName = (id) => { const s = data.subjects.find(x => x.id === id); return s ? s.name : ''; };
        const getRoomName = (id) => { const r = data.classrooms.find(x => x.id === id); return r ? r.name : ''; };

        const getStudentName = (groupIds, classIds) => {
            if (groupIds) {
                const gIdArr = groupIds.split(',');
                const names = [];
                gIdArr.forEach(gId => {
                    const grp = data.groups.find(x => x.id === gId);
                    if (grp) {
                        if (grp.entireclass) {
                            const c = data.classes.find(x => x.id === grp.classid);
                            if (c) names.push(c.name);
                        } else {
                            const c = data.classes.find(x => x.id === grp.classid);
                            names.push(c ? `${c.name}_${grp.name}` : grp.name);
                        }
                    }
                });
                if (names.length > 0) return names;
            }
            if (classIds) {
                const cIdArr = classIds.split(',');
                const names = [];
                cIdArr.forEach(cId => {
                    const c = data.classes.find(x => x.id === cId);
                    if (c) names.push(c.name);
                });
                return names;
            }
            return [];
        };

        const cardsGrouped = {};
        data.cards.forEach(card => {
            const key = card.lessonid + '_' + card.day;
            if (!cardsGrouped[key]) cardsGrouped[key] = [];
            cardsGrouped[key].push(card);
        });

        for (const [key, cards] of Object.entries(cardsGrouped)) {
            const lesson = data.lessons.find(l => l.id === cards[0].lessonid);
            if (!lesson) continue;

            cards.sort((a, b) => getPeriodIndex(a.period) - getPeriodIndex(b.period));
            const duration = lesson.periodspercard;

            for (let i = 0; i < cards.length; i += duration) {
                const card = cards[i];
                const actId = activityCounter++;

                activitiesXml += `<Activity>\n`;
                if (lesson.teacherids) {
                    lesson.teacherids.split(',').forEach(tId => {
                        const tName = getTeacherName(tId);
                        if (tName) activitiesXml += `<Teacher>${tName}</Teacher>\n`;
                    });
                }
                const sName = getSubjectName(lesson.subjectid);
                if (sName) activitiesXml += `<Subject>${sName}</Subject>\n`;

                const studentNames = getStudentName(lesson.groupids, lesson.classids);
                studentNames.forEach(st => {
                    activitiesXml += `<Students>${st}</Students>\n`;
                });

                activitiesXml += `<Duration>${duration}</Duration>\n`;
                activitiesXml += `<Total_Duration>${duration}</Total_Duration>\n`;
                activitiesXml += `<Id>${actId}</Id>\n`;
                activitiesXml += `<Activity_Group_Id>0</Activity_Group_Id>\n`;
                activitiesXml += `<Active>true</Active>\n`;
                activitiesXml += `</Activity>\n`;

                if (card.day && card.period) {
                    const dayMap = data.customMapping && data.customMapping.days ? data.customMapping.days[card.day] : null;
                    const periodMap = data.customMapping && data.customMapping.periods ? data.customMapping.periods[card.period] : null;

                    if (dayMap && !dayMap.ignore && periodMap && periodMap.shift !== 'ignore') {
                        const dayName = periodMap.shift === 'morning' ? dayMap.morning : dayMap.afternoon;
                        const periodName = `الحصة ${periodMap.fetIndex + 1}`;

                        timeConstraintsXml += `<ConstraintActivityPreferredStartingTime>\n`;
                        timeConstraintsXml += `<Weight_Percentage>100</Weight_Percentage>\n`;
                        timeConstraintsXml += `<Activity_Id>${actId}</Activity_Id>\n`;
                        timeConstraintsXml += `<Day>${dayName}</Day>\n`;
                        timeConstraintsXml += `<Hour>${periodName}</Hour>\n`;
                        timeConstraintsXml += `<Permanently_Locked>true</Permanently_Locked>\n`;
                        timeConstraintsXml += `</ConstraintActivityPreferredStartingTime>\n`;
                    }
                }

                let rooms = [];
                if (card.classroomids) rooms = card.classroomids.split(',');
                else if (lesson.classroomids) rooms = lesson.classroomids.split(',');

                if (rooms.length === 1) {
                    const rName = getRoomName(rooms[0]);
                    if (rName) {
                        spaceConstraintsXml += `<ConstraintActivityPreferredRoom>\n<Weight_Percentage>100</Weight_Percentage>\n<Activity_Id>${actId}</Activity_Id>\n<Room>${rName}</Room>\n<Permanently_Locked>true</Permanently_Locked>\n</ConstraintActivityPreferredRoom>\n`;
                    }
                }
            }
        }

        activitiesXml += `</Activities_List>\n`;
        timeConstraintsXml += `</Time_Constraints_List>\n`;
        spaceConstraintsXml += `</Space_Constraints_List>\n`;

        xml += activitiesXml;
        xml += timeConstraintsXml;
        xml += spaceConstraintsXml;
        xml += `</fet>`;

        generatedXml = xml;

        hideAllCards();
        activitiesCountSpan.textContent = activityCounter - 1;
        successCard.classList.remove('hidden');
        triggerDownload("FET");
    }

    function triggerDownload(type = "ASC") {
        if (!generatedXml) return;
        const blob = new Blob([generatedXml], { type: "text/xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = type === "ASC" ? "_aSc.xml" : "_from_aSc.fet";
        a.download = `${originalFileName}${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadBtn.addEventListener('click', () => {
        const type = (currentMode === 'fet2asc' || currentMode === 'highest2asc' || currentMode === '12temps2asc') ? 'ASC' : 'FET';
        triggerDownload(type);
    });

    function hideAllCards() {
        statusCard.classList.add('hidden');
        mappingCard.classList.add('hidden');
        successCard.classList.add('hidden');
        errorCard.classList.add('hidden');
    }

    function showError(msg) {
        hideAllCards();
        document.getElementById('error-message').textContent = msg;
        errorCard.classList.remove('hidden');
    }
});
