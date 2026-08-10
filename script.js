document.addEventListener('DOMContentLoaded', () => {
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
    const dropZoneText = document.getElementById('drop-zone-text');
    const fileUploadLabel = document.getElementById('file-upload-label');

    let generatedXml = '';
    let originalFileName = '';
    
    let parsedData = null; // Store data temporarily before export
    let currentMode = 'fet2asc'; // 'fet2asc' or 'asc2fet'
    
    // Mode Selection Logic
    function updateModeUI() {
        if (modeFet2Asc.checked) {
            currentMode = 'fet2asc';
            dropZoneText.textContent = "اسحب وأفلت ملف FET هنا";
            fileUploadLabel.textContent = "اختر ملف FET";
            fileInput.accept = ".fet";
        } else {
            currentMode = 'asc2fet';
            dropZoneText.textContent = "اسحب وأفلت ملف aSc XML هنا";
            fileUploadLabel.textContent = "اختر ملف XML";
            fileInput.accept = ".xml";
        }
        hideAllCards();
    }
    
    if (modeFet2Asc && modeAsc2Fet) {
        modeFet2Asc.addEventListener('change', updateModeUI);
        modeAsc2Fet.addEventListener('change', updateModeUI);
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

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length === 0) return;
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

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                if (currentMode === 'fet2asc') {
                    parseFET(e.target.result);
                } else {
                    parseAscXml(e.target.result);
                }
            } catch (error) {
                console.error(error);
                showError("حدث خطأ أثناء تحليل الملف.");
            }
        };
        reader.readAsText(file);
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
                        if(baseClass.endsWith('_')) baseClass = baseClass.slice(0, -1);
                        division = 1;
                    } else if (students.includes('_ف2') || students.includes('_Ý2') || students.includes('G2') || students.includes('ف2')) {
                        baseClass = students.replace('_ف2', '').replace('_Ý2', '').replace('G2', '').replace('ف2', '').trim();
                        if(baseClass.endsWith('_')) baseClass = baseClass.slice(0, -1);
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
            if(day && hour) {
                timeMap[actId] = { day, hour };
                if (!uniqueFetDays.includes(day)) uniqueFetDays.push(day);
            }
        });

        const roomMap = {};
        roomNodes.forEach(node => {
            const actId = node.querySelector('Activity_Id')?.textContent;
            const room = node.querySelector('Room')?.textContent;
            if(room) {
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
            dayNamesMap
        };

        showMappingUI();
    }

    function showMappingUI() {
        hideAllCards();
        mappingContainer.innerHTML = '';
        
        const isHalfDaysMode = halfDaysToggle.checked;
        
        if (isHalfDaysMode) {
            if(mappingInstructions) mappingInstructions.textContent = "تتم المزامنة بين أنصاف الأيام في ملف FET والأيام في aSc (من اليوم 1 إلى اليوم 12):";
            
            parsedData.uniqueFetDays.forEach((fetDay, i) => {
                const row = document.createElement('div');
                row.className = 'mapping-row';
                const longName = parsedData.dayNamesMap ? (parsedData.dayNamesMap[fetDay] || fetDay) : fetDay;
                
                let options = '';
                for(let d=0; d<12; d++) {
                    options += `<option value="${d}" ${d === i ? 'selected' : ''}>اليوم ${d + 1}</option>`;
                }
                
                row.innerHTML = `
                    <div class="mapping-label">${fetDay} ${longName && longName !== fetDay ? `(${longName})` : ''}</div>
                    <div class="mapping-selects">
                        <select class="mapping-select half-day-select" data-fetday="${fetDay}">
                            ${options}
                        </select>
                    </div>
                `;
                mappingContainer.appendChild(row);
            });
        } else {
            if(mappingInstructions) mappingInstructions.textContent = "قم بربط أيام ملف FET بأيام aSc والفترات (صباحي/مسائي):";
            
            const ascDays = [
                {val: 0, label: "الأحد (DIM)"},
                {val: 1, label: "الإثنين (LUN)"},
                {val: 2, label: "الثلاثاء (MAR)"},
                {val: 3, label: "الأربعاء (MER)"},
                {val: 4, label: "الخميس (JEU)"},
                {val: 5, label: "السبت (SAM)"}
            ];
            
            parsedData.uniqueFetDays.forEach(fetDay => {
                const row = document.createElement('div');
                row.className = 'mapping-row';
                
                const longName = parsedData.dayNamesMap ? (parsedData.dayNamesMap[fetDay] || fetDay) : fetDay;
                const searchStr = longName + " " + fetDay;
                
                // Try to guess default mapping
                let defaultDay = 0;
                if (searchStr.includes('إثنين') || searchStr.includes('اثنين')) defaultDay = 1;
                else if (searchStr.includes('ثلاثاء')) defaultDay = 2;
                else if (searchStr.includes('أربعاء') || searchStr.includes('اربعاء')) defaultDay = 3;
                else if (searchStr.includes('خميس')) defaultDay = 4;
                
                let defaultShift = (searchStr.includes(' م') || searchStr.endsWith('م') || searchStr.includes('مساء')) ? 1 : 0;
                
                row.innerHTML = `
                    <div class="mapping-label">${fetDay} ${longName && longName !== fetDay ? `(${longName})` : ''}</div>
                    <div class="mapping-selects">
                        <select class="mapping-select day-select" data-fetday="${fetDay}">
                            ${ascDays.map(d => `<option value="${d.val}" ${d.val === defaultDay ? 'selected' : ''}>${d.label}</option>`).join('')}
                        </select>
                        <select class="mapping-select shift-select" data-fetday="${fetDay}">
                            <option value="0" ${defaultShift === 0 ? 'selected' : ''}>صباحي (الحصص 1-4)</option>
                            <option value="1" ${defaultShift === 1 ? 'selected' : ''}>مسائي (الحصص 5-8)</option>
                        </select>
                    </div>
                `;
                mappingContainer.appendChild(row);
            });
        }
        
        mappingCard.classList.remove('hidden');
    }

    halfDaysToggle.addEventListener('change', () => {
        showMappingUI();
    });

    exportBtn.addEventListener('click', () => {
        const isHalfDaysMode = halfDaysToggle.checked;
        
        const dayConfig = {};
        
        if (isHalfDaysMode) {
            const selects = document.querySelectorAll('.half-day-select');
            for(let i=0; i<selects.length; i++){
                const fetDay = selects[i].getAttribute('data-fetday');
                dayConfig[fetDay] = parseInt(selects[i].value);
            }
        } else {
            const daySelects = document.querySelectorAll('.day-select');
            const shiftSelects = document.querySelectorAll('.shift-select');
            
            for(let i=0; i<daySelects.length; i++){
                const fetDay = daySelects[i].getAttribute('data-fetday');
                const mappedDay = parseInt(daySelects[i].value);
                const mappedShift = parseInt(shiftSelects[i].value); // 0=Morning, 1=Afternoon
                dayConfig[fetDay] = { day: mappedDay, shift: mappedShift };
            }
        }
        
        generateAscXml(dayConfig, isHalfDaysMode);
    });

    function generateAscXml(dayConfig, isHalfDaysMode) {
        const { activities, teachersArr, subjectsArr, classesArr, roomsArr, timeMap, roomMap, classDivisionsMap, uniqueFetDays, dayNamesMap } = parsedData;

        const teacherId = (name) => `*${teachersArr.indexOf(name) + 1}`;
        const subjectId = (name) => `*${subjectsArr.indexOf(name) + 1}`;
        const classIdNum = (name) => classesArr.indexOf(name) + 1;
        const classIdStr = (name) => `*${classIdNum(name)}`;
        const roomId = (name) => `*${roomsArr.indexOf(name) + 1}`;

        // Build aSc XML String
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<timetable ascttversion="2010.3.1" importtype="database" options="idprefix:XML,groupstype1,decimalseparatordot" defaultexport="1">\n`;

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
            const dayNames = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "السبت"];
            const dayShorts = ["DIM", "LUN", "MAR", "MER", "JEU", "SAM"];
            for(let i=0; i<6; i++){
                xml += `<day day="${i}" short="${dayShorts[i]}" name="${dayNames[i]}"/>\n`;
            }
        }
        xml += `</days>\n`;

        // Periods (Standard 1 to 8, + 0 for 7:00. If half-days mode, only 4 periods)
        xml += `<periods options="canadd" columns="period,starttime,endtime">\n`;
        const maxPeriods = isHalfDaysMode ? 4 : 8;
        for(let i=0; i<=maxPeriods; i++){
            xml += `<period period="${i}" starttime="${7+i}:00" endtime="${8+i}:00"/>\n`;
        }
        xml += `</periods>\n`;
        xml += `<dayperiods options="canadd" columns="day,period,starttime,endtime"/>\n`;

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
        xml += `<lessons options="canadd" columns="id,subjectid,classids,groupids,studentids,teacherids,classroomids,periodspercard,periodsperweek,weeks">\n`;
        activities.forEach(act => {
            if(!act.parsedStudents || act.parsedStudents.length === 0) return;
            
            let rId = roomMap[act.id] ? roomId(roomMap[act.id]) : "";
            let tId = act.teachers ? act.teachers.map(t => teacherId(t)).join(",") : "";
            let sId = act.subject ? subjectId(act.subject) : "";
            
            let cId = act.parsedStudents.map(ps => classIdStr(ps.baseClass)).join(",");
            let gId = act.parsedStudents.map(ps => {
                let cIdNum = classIdNum(ps.baseClass);
                if(ps.division > 0) return `*${cIdNum * 10 + ps.division}`;
                else return `*${cIdNum * 10}`; // Entire class
            }).join(",");
            
            xml += `<lesson id="*${act.id}" classroomids="${rId}" weeks="1" studentids="" groupids="${gId}" teacherids="${tId}" periodsperweek="1.0" periodspercard="${act.duration}" subjectid="${sId}" classids="${cId}"/>\n`;
        });
        xml += `</lessons>\n`;

        // Cards
        xml += `<cards options="canadd" columns="lessonid,day,period,classroomids">\n`;
        activities.forEach(act => {
            const time = timeMap[act.id];
            if(time && time.day && time.hour) {
                let hMatch = time.hour.match(/\d+/);
                let h = hMatch ? parseInt(hMatch[0]) : 1;
                let rId = roomMap[act.id] ? roomId(roomMap[act.id]) : "";

                if (isHalfDaysMode) {
                    let mappedDay = dayConfig[time.day];
                    if (mappedDay !== undefined) {
                        xml += `<card day="${mappedDay}" period="${h}" classroomids="${rId}" lessonid="*${act.id}"/>\n`;
                    }
                } else {
                    let conf = dayConfig[time.day];
                    if(conf) {
                        let p = h;
                        if(conf.shift === 1) p = h + 4; // Shift afternoon to period 5-8
                        xml += `<card day="${conf.day}" period="${p}" classroomids="${rId}" lessonid="*${act.id}"/>\n`;
                    }
                }
            }
        });
        xml += `</cards>\n`;

        // Grades
        xml += `<grades options="canadd" columns="id,name,short,grade">\n`;
        for(let i=1; i<=20; i++){
            xml += `<grade id="*${i}" short="${i}" name="${i}" grade="${i}"/>\n`;
        }
        xml += `</grades>\n`;
        
        xml += `</timetable>`;

        generatedXml = xml;
        
        // Show success
        hideAllCards();
        activitiesCountSpan.textContent = activities.length;
        successCard.classList.remove('hidden');
        triggerDownload("ASC");
    }

    function parseAscXml(xmlString) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        
        const days = Array.from(xmlDoc.querySelectorAll('days day')).map(node => ({
            id: node.getAttribute('day'),
            name: node.getAttribute('name')
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
            day: node.getAttribute('day'),
            period: node.getAttribute('period'),
            classroomids: node.getAttribute('classroomids')
        }));
        
        const parsedAscData = {
            days, periods, teachers, subjects, classes, classrooms, groups, lessons, cards
        };
        
        generateFetXml(parsedAscData);
    }
    
    function generateFetXml(data) {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<fet version="6.28.2">\n`;
        xml += `<Institution_Name>Generated by fet2asc (asc2fet mode)</Institution_Name>\n`;
        xml += `<Comments>Converted from aSc XML</Comments>\n`;
        
        // Hours
        xml += `<Hours_List>\n`;
        xml += `<Number>${data.periods.length}</Number>\n`;
        data.periods.forEach(p => {
            xml += `<Name>${p.name}</Name>\n`;
        });
        xml += `</Hours_List>\n`;
        
        // Days
        xml += `<Days_List>\n`;
        xml += `<Number>${data.days.length}</Number>\n`;
        data.days.forEach(d => {
            xml += `<Name>${d.name}</Name>\n`;
        });
        xml += `</Days_List>\n`;
        
        // Students
        xml += `<Students_List>\n`;
        data.classes.forEach(c => {
            xml += `<Year>\n`;
            xml += `<Name>سنة_${c.name}</Name>\n<Number_of_Students>30</Number_of_Students>\n`;
            
            const classGroups = data.groups.filter(g => g.classid === c.id);
            
            xml += `<Group>\n`;
            xml += `<Name>${c.name}</Name>\n<Number_of_Students>30</Number_of_Students>\n`;
            
            classGroups.forEach(g => {
                if(!g.entireclass) {
                    xml += `<Subgroup>\n`;
                    xml += `<Name>${g.name}</Name>\n<Number_of_Students>15</Number_of_Students>\n`;
                    xml += `</Subgroup>\n`;
                }
            });
            
            xml += `</Group>\n`;
            xml += `</Year>\n`;
        });
        xml += `</Students_List>\n`;
        
        // Teachers
        xml += `<Teachers_List>\n`;
        data.teachers.forEach(t => {
            xml += `<Teacher>\n<Name>${t.name}</Name>\n</Teacher>\n`;
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
        let timeConstraintsXml = `<Time_Constraints_List>\n<ConstraintBasicWeightPercentage>\n<Weight_Percentage>100</Weight_Percentage>\n</ConstraintBasicWeightPercentage>\n`;
        let spaceConstraintsXml = `<Space_Constraints_List>\n<ConstraintBasicCompulsorySpace>\n<Weight_Percentage>100</Weight_Percentage>\n</ConstraintBasicCompulsorySpace>\n`;
        
        let activityCounter = 1;
        
        const getDayName = (id) => { const d = data.days.find(x => x.id === id); return d ? d.name : ''; };
        const getPeriodName = (id) => { const p = data.periods.find(x => x.id === id); return p ? p.name : ''; };
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
                            if(c) names.push(c.name);
                        } else {
                            names.push(grp.name);
                        }
                    }
                });
                if(names.length > 0) return names;
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
        
        data.cards.forEach(card => {
            const lesson = data.lessons.find(l => l.id === card.lessonid);
            if (!lesson) return;
            
            const actId = activityCounter++;
            const duration = lesson.periodspercard;
            
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
            
            const dayName = getDayName(card.day);
            const periodName = getPeriodName(card.period);
            if (dayName && periodName) {
                timeConstraintsXml += `<ConstraintActivityPreferredStartingTime>\n<Weight_Percentage>100</Weight_Percentage>\n<Activity_Id>${actId}</Activity_Id>\n<Day>${dayName}</Day>\n<Hour>${periodName}</Hour>\n<Permanently_Locked>true</Permanently_Locked>\n</ConstraintActivityPreferredStartingTime>\n`;
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
        });
        
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
        if(!generatedXml) return;
        const blob = new Blob([generatedXml], {type: "text/xml;charset=utf-8"});
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
        const type = currentMode === 'fet2asc' ? 'ASC' : 'FET';
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
