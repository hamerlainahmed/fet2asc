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

    let generatedXml = '';
    let originalFileName = '';
    
    let parsedData = null; // Store data temporarily before export

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
        
        if (!file.name.toLowerCase().endsWith('.fet')) {
            showError("الرجاء اختيار ملف بصيغة FET صالح.");
            return;
        }

        originalFileName = file.name.replace(/\.[^/.]+$/, "");
        
        hideAllCards();
        statusCard.classList.remove('hidden');

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                parseFET(e.target.result);
            } catch (error) {
                console.error(error);
                showError("حدث خطأ أثناء تحليل الملف. تأكد من أنه ملف FET صالح.");
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
        triggerDownload();
    }

    function triggerDownload() {
        if(!generatedXml) return;
        const blob = new Blob([generatedXml], {type: "text/xml;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${originalFileName}_aSc.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadBtn.addEventListener('click', triggerDownload);

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
