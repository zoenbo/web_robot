const tag_types = [
    "自由选择器",
    "a",
    "body",
    "button",
    "div",
    "i",
    "img",
    "input",
    "li",
    "p",
    "span",
    "td",
    "textarea",
    "tr",
    "ul",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
];

// 获取数据存储
function get_my_robot(callback) {
    chrome.storage.local.get(["my_robot"], function (res) {
        if (callback) callback(res.my_robot);
    });
}

// 设置数据存储
function set_my_robot(new_robot, cb) {
    chrome.storage.local.set(
        {
            my_robot: new_robot,
        },
        function () {
            cb && cb();
        }
    );
}

// 拼接执行的js
function jscode(process) {
    let exec_code = "(function(){ \n";
    if (
        process["opera"] === "click" ||
        process["opera"] === "value" ||
        process["opera"] === "mouseover"
    ) {
        if (tag_types.indexOf(process.tag) === -1) {
            exec_code += `var robot_node;\n`;
            exec_code += `
                let ptag = '${process.tag}';
                if (ptag.indexOf("{") !== -1 && ptag.indexOf("}") !== -1) {
                    let doms = document.querySelectorAll(ptag.substring(0, ptag.indexOf("{")));
                    let value = ptag.substring(ptag.indexOf("{") + 1, ptag.indexOf("}"));
                    robot_node = Array.prototype.slice.call(doms)
                    .filter(d => d.textContent.trim() === value && d.children.length === 0)[${process.n}];
                }else{
                    robot_node = document.querySelectorAll(ptag)[${process.n}];
                }\n`;
        } else {
            exec_code += `robot_node = document.getElementsByTagName('${process.tag}')[${process.n}];\n`;
        }
        exec_code += `function myrobot_getAbsPoin(dom) {
            let x = dom.offsetLeft;
            let y = dom.offsetTop;
            while (dom.offsetParent) {
                dom = dom.offsetParent;
                x += dom.offsetLeft;
                y += dom.offsetTop;
            }
            return {
                'x': x,
                'y': y
            };
        };\n`;
        exec_code += `let domposi = myrobot_getAbsPoint(robot_node);\n`;
        exec_code += `if (domposi.y < window.scrollY || domposi.y > (window.scrollY + window.innerHeight * 0.8) ||
                domposi.x < window.scrollX || domposi.x > (window.scrollX + window.innerWidth * 0.8)) {
                window.scrollTo(domposi.x - window.innerWidth / 2, domposi.y - window.innerHeight / 2);}\n`;
    }
    if (process["opera"] === "click") {
        exec_code += "robot_node.click();";
    } else if (process["opera"] === "value") {
        /**
         * 为react兼容
         */
        exec_code += "let lastValue = robot_node.value;";
        exec_code += `robot_node.value='${process.value}';`;
        exec_code += "let event = new Event('input', { bubbles: true });";
        exec_code += "event.simulated = true;";
        exec_code += "let tracker = robot_node._valueTracker;";
        exec_code += "if (tracker) { tracker.setValue(lastValue); }\n";
        exec_code += "robot_node.dispatchEvent(event);";
    } else if (process["opera"] === "refresh") {
        exec_code += "window.location.reload();";
    } else if (process["opera"] === "pagejump") {
        exec_code += `window.location.href='${process.value}';`;
    } else if (process["opera"] === "mouseover") {
        exec_code += `let mouseoverevent = new MouseEvent('mouseover', {bubbles: true, cancelable: true});`;
        exec_code += `robot_node.dispatchEvent(mouseoverevent);`;
    }
    exec_code += "\n})();";
    return exec_code;
}

// 等待
function sleep(s) {
    return new Promise(function (resolve, reject) {
        setTimeout(resolve, s * 1000);
    });
}

// function resetwh(w, h, name) {
//     let id = name.split("-")[1];
//     w = w + "px";
//     h = h + "px";
//     document.getElementById(`frame-${id}`).style.width = w;
//     document.getElementById(`frame-${id}`).style.height = h;
//     document.getElementById(`grid-${id}`).style.width = w;
//     document.getElementById(`grid-${id}`).style.height = h;
// }

function exec_run_item(process_item, tab_id, name, grid) {
    if (process_item.opera === "onlyshow") {
        chrome.tabs.sendMessage(tab_id, {
            name: name,
            type: "onlyshow",
            tag: process_item.tag,
            n: process_item.n,
            grid: grid,
            width: document.getElementById(name).clientWidth + "px",
            height: document.getElementById(name).clientHeight + "px"
        }, (msg) => {
            // resetwh(msg.data.w, msg.data.h, name);
        })
    } else {
        chrome.tabs.sendMessage(tab_id, {
            name: name,
            type: "execute_frame",
            code: jscode(process_item)
        })
    }
}


// dom检查自旋运行
function dom_check_run(process, tab_id, name, grid) {
    // console.log("dom check run")
    let run_status = 0; // 运行状态 0 - 正在检查，1 - 等待运行，2 - 正在运行
    let now_index = 0; // 当前运行process
    let args = {}; // 可取参数列表（包括取值导入）
    let count = 0;
    if (process.length === 0) {
        callback();
        return;
    }
    let dom_itvl = setInterval(function () {
        // console.log("status: " + run_status);
        if (run_status == 0 && !process[now_index].check) {
            run_status = 1;
        }
        if (run_status == 0) {
            count += 1;
            chrome.tabs.sendMessage(
                tab_id,
                {
                    type: "get_dom_frame",
                    name: name,
                    tag: process[now_index].tag,
                    n: process[now_index].n,
                },
                function (msg) {
                    // console.log(msg)
                    if (msg.type == "get_dom_frame" && msg.dom) {
                        run_status = 1;
                        count = 0;
                    }
                }
            );
        } else if (run_status == 1) {
            run_status = 2;
            setTimeout(function () {
                exec_run_item(process[now_index], tab_id, name, grid);
                now_index += 1;
                run_status = 0;
            }, process[now_index].wait * 1000);
            if (process.length - 1 === now_index) {
                clearInterval(dom_itvl);
            }
        }
        if (count == 50) {
            clearInterval(dom_itvl);
            console.log(
                `dom not found: ${process[now_index].tag} , ${process[now_index].n}`
            );
        }
    }, 200);
}

// 运行流程事务
// async function exec_run(process, tab_id, name, grid) {
//     for (let i = 0; i < process.length; i++) {
//         await sleep(process[i].wait);
//         await exec_run_item(process[i], tab_id, name, grid);
//     }
// }

function fetch_html(url, cb) {
    fetch(url)
        .then(resp => resp.text())
        .then(data => cb && cb(data));
}

$(document).ready(function () {

    let grid = GridStack.init({
        alwaysShowResizeHandle: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
        ),
        resizable: {
            handles: 'e, se, s, sw, w'
        },
        column: 100,
        cellHeight: 'auto',
        float: true,
        enableMove: true,
        enableResize: true,
        margin: 2
    });

    $("body").mousemove(e => {
        let sh = e.clientX / window.innerWidth;
        if (e.clientY < 10 && sh > 0.4 && sh < 0.6) {
            $("#opera").show();
        }
    });

    $("#opera").mouseleave(e => {
        if ($("#handgrid").text() === "排版") {
            $("#opera").hide();
        }
    });

    chrome.tabs.getCurrent(tab => {
        get_my_robot(my_robot => {
            let process = [];
            let names = [];
            let mygrid = my_robot.SETTING_DATA.DASHBOARD_GRID || [];
            // mygrid = []
            let mygridmap = {};
            grid.enableMove(false);
            grid.enableResize(false);
            grid.load(mygrid);
            grid.commit();

            for (let i = 0; i < mygrid.length; i++) {
                mygridmap[mygrid[i].id] = mygrid[i];
            }

            for (let i = 0; i < my_robot.SETTING_DATA.KEYS.length; i++) {
                let key = my_robot.SETTING_DATA.KEYS[i];
                let tmpid = `frame-${key}`;
                if (mygridmap[tmpid]) {
                    process.push(my_robot[key].case_process.slice(1))
                    names.push(tmpid);
                } else {
                    if (my_robot[key].add_dashboard) {
                        let grid_contain = `<iframe src="${my_robot[key].case_process[0].value}" name="${tmpid}" id="${tmpid}"></iframe>`;
                        let newgrid = {
                            w: 20,
                            h: 20,
                            content: grid_contain,
                            id: tmpid,
                            url: my_robot[key].case_process[0].value
                        };
                        grid.addWidget(newgrid);
                        mygridmap[tmpid] = newgrid;
                        process.push(my_robot[key].case_process.slice(1))
                        names.push(tmpid);
                    }
                }
            }

            for (let i = 0; i < names.length; i++) {
                dom_check_run(process[i], tab.id, names[i], mygridmap[names[i]]);
            }

            // grid.on("dragstop resizestop", (e, el) => {
            //     my_robot.SETTING_DATA.DASHBOARD_GRID = grid.save();
            //     set_my_robot(my_robot);
            // });

            $("#handgrid").click(e => {
                if ($("#handgrid").text() == "排版") {
                    $("#handgrid").html("保存");
                    let editgrid = [];
                    let tmpgridmap = JSON.parse(JSON.stringify(mygridmap))
                    for (let i = 0; i < names.length; i++) {
                        tmpgridmap[names[i]].content = `<i class="fa fa-close close-panel" aria-hidden="true" id="panel-${i}"></i>`;
                        tmpgridmap[names[i]].content += `<div style="text-align: center">${names[i].slice(6)}</div>`
                        tmpgridmap[names[i]].id = `panel-${i}`;
                        editgrid.push(tmpgridmap[names[i]]);
                    }
                    grid.load(editgrid, true);
                    grid.enableMove(true);
                    grid.enableResize(true);
                } else {
                    $("#handgrid").html("排版");
                    let editgrid = grid.save();
                    let tmpkeys = [];
                    for (let i = 0; i < editgrid.length; i++) {
                        let idx = parseInt(editgrid[i].id.slice(6));
                        tmpkeys.push(names[idx]);
                        mygridmap[names[idx]].x = editgrid[i].x;
                        mygridmap[names[idx]].y = editgrid[i].y;
                        mygridmap[names[idx]].w = editgrid[i].w;
                        mygridmap[names[idx]].h = editgrid[i].h;
                    }
                    let tmpgrid = [];
                    for (let i = 0; i < tmpkeys.length; i++) {
                        tmpgrid.push(mygridmap[tmpkeys[i]]);
                    }
                    my_robot.SETTING_DATA.DASHBOARD_GRID = tmpgrid;
                    set_my_robot(my_robot, () => {
                        window.location.reload();
                    });
                }
            });

            $(".grid-stack").on("click", ".close-panel", e => {
                let thisgrid = grid.save();
                for (let i = 0; i < thisgrid.length; i++) {
                    if (thisgrid[i].id === e.target.id) {
                        thisgrid.splice(i, 1);
                        break;
                    }
                }
                grid.load(thisgrid, true);
                my_robot[names[parseInt(e.target.id.slice(6))].slice(6)].add_dashboard = false;
                // names.splice(parseInt(e.target.id.slice(6)), 1);
            });

            $("#reset").click(e => {
                my_robot.SETTING_DATA.DASHBOARD_GRID = [];
                set_my_robot(my_robot, () => {
                    window.location.reload();
                })
            })
        })
    })
})

// fetch html 也可以实现突破 x-frame-origin 限制，但会缺少js事件，目前使用backgroud修改response头实现
// for (let i = 0; i < mygrid.length; i++) {
// let frame = document.createElement("iframe");
// frame.onload = function () {
//     fetch_html("https://www.zhihu.com/hot", data => {
//         let ed = frame.contentWindow.document;
//         ed.open();
//         ed.write(data);
//         ed.close();
//         ed.contentEditable = true;
//         ed.designMode = 'on';
//         mygrid[i].content = frame.outerHTML;
//         if (i == mygrid.length - 1) {
//             grid.load(mygrid);
//             document.getElementById("reframe").style.display = "none";
//         }
//     })
// }
// document.getElementById("reframe").appendChild(frame);
// mygrid[i].content = `<iframe name="${mygrid[i].id}" id="${mygrid[i].id}"></iframe>`
// console.log(mygrid)
// }