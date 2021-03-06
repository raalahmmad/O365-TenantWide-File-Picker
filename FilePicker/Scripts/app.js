﻿(function () {
    var host = "https://localhost:44300";
    angular.module("filePicker", [])
    .controller("searchCtrl", ["$scope", "$http", function ($scope, $http) {
        $scope.items = [];
        $scope.searchTerms = "";
        $scope.waiting = true;
        $scope.active_view = "OneDrive";
        $scope.breadcrumb = [{ name: "OneDrive", id: null, type: "root", path: null }];

        //toggles between OneDrive view and Sites View
        $scope.toggleNav = function (item) {
            //ignore clicks on the active item
            if ($scope.active_view === item)
                return;

            //set the active_view and start waiting
            $scope.active_view = item;
            $scope.waiting = true;

            //check id this is OneDrive or Sites
            if (item === "OneDrive") {
                $scope.breadcrumb = [{ name: "OneDrive", id: null, type: "root", path: null }];
                queryOneDrive(null);
            }
            else {
                // $scope.breadcrumb = [{ name: "Sites", id: null, type: "root", path: null }];
                $scope.breadcrumb = [{ name: "Site Collections", id: null, type: "root", path: null }];
                querySites();
            }
        };

        //handles navigation back to an item in the breadcrumb
        $scope.breadnav = function (item, index) {
            //ignore clicks on current breadcrumb level
            if (index === $scope.breadcrumb.length - 1)
                return;

            //start waiting and determine if this is reset or middle breadcrumb
            $scope.waiting = true;
            if (index === 0) {
                //reset based on the activeview
                if ($scope.active_view === "OneDrive")
                    queryOneDrive(null);
                else
                    querySites();
            }
            else {
                //navigate based on the activeview
                if ($scope.active_view === "OneDrive")
                    queryOneDrive(item.id);
                else if (item.type !== "lib")
                    querySite(item.path);
                else
                    queryLib(item.path, null);
            }

            //update breadcrumb by removing ends
            while (index < $scope.breadcrumb.length - 1)
                $scope.breadcrumb.pop();
        };

        //handles the item clicked event
        $scope.clicked = function (item) {
            //for files we just toggle the selected flag
            if (item.type === "File") {
                item.selected = !item.selected;
                return;
            }

            //start waiting
            $scope.waiting = true;

            //handle click based on type
            if (item.type === "Site") {
                //this is a site/web
                $scope.breadcrumb.push({ name: item.name, id: item.id, type: item.type, path: item.path });
                querySite(item.path);
            }
            else if (item.type === "lib") {
                //this is a library
                $scope.breadcrumb.push({ name: item.name, id: item.id, type: item.type, path: item.path });
                queryLib(item.path, null);
            }
            else {
                //this is a folder
                $scope.breadcrumb.push({ name: item.name, id: item.id, type: item.type, path: item.path });
                if ($scope.active_view === "OneDrive")
                    queryOneDrive(item.id);
                else
                    queryLib(item.path, item.id)
            }
        };
        
        //queries OneDrive
        var queryOneDrive = function (id) {
            //build query based on id
            var query = "";
            if (id === null)
                query = "/files";
            else
                query = "/files/" + id + "/children";

            //perform query
            $scope.items = [];
            $http.defaults.headers.common["Authorization"] = "Bearer " + auth_details.myToken;
            $http.defaults.headers.post["accept"] = "application/json;odata=verbose";
            $http.get(auth_details.myEndpoint + query)
            .success(function (data) {
                $(data.value).each(function (i, e) {
                    if (e.type === "Folder")
                        $scope.items.push({ "name": e.name, "type": e.type, "id": e.id, extension: "folder", path: e.webUrl });
                    else if (e.type === "File") {
                        //get the file extension
                        var ext = e.name.substring(e.name.lastIndexOf(".") + 1).toLowerCase();
                        
                        //only add media files
                        if (ext === "png" || ext === "gif" || ext === "jpg" || ext === "jpeg" || ext === "mp4") {
                            $scope.items.push({ "name": e.name, "type": e.type, "id": e.id, extension: ext, size: e.size, path: e.webUrl });
                        }
                    }
                });
                $scope.waiting = false;
            })
            .error(function (err) {
                //TODO
            });
        };

        //queries a library
        var queryLib = function (path, id) {
            //build query based on id
            if (id === null)
                path += "/files";
            else
                path += "/children";

            //perform query
            $scope.items = [];
            $http.defaults.headers.common["Authorization"] = "Bearer " + auth_details.rootToken;
            $http.defaults.headers.post["accept"] = "application/json;odata=verbose";
            $http.get(path)
            .success(function (data) {
                $(data.value).each(function (i, e) {
                    if (e["odata.type"] === "MS.FileServices.Folder")
                        $scope.items.push({ "name": e.Name, "type": "Folder", "id": e.Id, extension: "folder", path: e["odata.id"] });
                    else if (e["odata.type"] === "MS.FileServices.File") {
                        //get the file extension
                        var ext = e.Name.substring(e.Name.lastIndexOf(".") + 1).toLowerCase();

                        //only add media files
                        if (ext === "png" || ext === "gif" || ext === "jpg" || ext === "jpeg" || ext === "mp4") {
                            $scope.items.push({ "name": e.Name, "type": "File", "id": e.Id, extension: ext, size: e.Size, path: e.Url });
                        }
                    }
                });
                $scope.waiting = false;
            })
            .error(function (err) {
                //TODO
            });
        };

        //queries all site collections the user has access to
        var querySites = function () {
            //perform sharepoint search to locate sites collections the user has access to
            $scope.items = [];
            $http.defaults.headers.common["Authorization"] = "Bearer " + auth_details.rootToken;
            $http.defaults.headers.post["accept"] = "application/json;odata=verbose";
            $http.get(auth_details.rootEndpoint + "/search/query?querytext='contentclass:sts_site'&trimduplicates=true&rowlimit=100&SelectProperties='WebTemplate,Title,Path,SiteLogo'")
            .success(function (data) {
                $(data.PrimaryQueryResult.RelevantResults.Table.Rows).each(function (i, e) {
                    $scope.items.push(parseRow(e));
                });

                $scope.waiting = false;
            })
            .error(function (err) {
                //TODO
            });
        };

        //queries a site
        var querySite = function (path) {
            $scope.items = [];

            //first get webs
            $http.defaults.headers.common["Authorization"] = "Bearer " + auth_details.rootToken;
            $http.defaults.headers.post["accept"] = "application/json;odata=verbose";
            $http.get(path + "/webs")
            .success(function (webdata) {
                $(webdata.value).each(function (i, e) {
                    $scope.items.push({ "name": e.Title, "type": "Site", "id": e.Id, extension: "site", size: null, path: e["odata.id"] });
                });

                //now get lists
                $http.defaults.headers.common["Authorization"] = "Bearer " + auth_details.rootToken;
                $http.defaults.headers.post["accept"] = "application/json;odata=verbose";
                $http.get(path + "/Lists")
                .success(function (data) {
                    $(data.value).each(function (i, e) {
                        if (!e.Hidden && e.BaseTemplate == 101) {
                            $scope.items.push({ "name": e.Title, "type": "lib", "id": e.id, extension: "lib", size: null, path: e["odata.id"] });
                        }
                    });
                    $scope.waiting = false;
                })
                .error(function (err) {
                    //TODO
                });
            })
            .error(function (err) {
                //TODO
            });
        };

        //parses a search result into a flat row
        var parseRow = function (row) {
            var item = { selected: false };
            item.type = "Site";
            item.extension = "site";
            $(row.Cells).each(function (i, e) {
                if (e.Key === "Path")
                    item.path = e.Value + "/_api/web";
                if (e.Key === "Title")
                    item.name = e.Value;
            });
            return item;
        }

        //perform initial search
        queryOneDrive(null);

        //event for sending selections back to parent window
        $scope.ok = function () {
            var data = { action: "result", files: [] };
            $($scope.items).each(function (i, e) {
                if (e.selected) {
                    data.files.push(e);
                }
            });
            window.opener.postMessage(JSON.stringify(data), host);
            window.close();
        };

        //event for canceling the picker and sending cancel action back to parent window
        $scope.cancel = function () {
            window.opener.postMessage(JSON.stringify({ action: "cancel", files: null }), host);
            window.close();
        };
    }]);

    $(document).ready(function () {
        //wire up angular to the page
        angular.bootstrap($("#container"), ["filePicker"]);
    });
})();


//these are all office fabric events
var fabric = fabric || {};
fabric.Spinner = function (holderElement, spinnerType) {

    var _holderElement = holderElement;
    var _spinnerType = spinnerType || "eight";
    var eightSize = 0.18;
    var sixteenSize = 0.1;
    var circleObjects = [];
    var animationSpeed = 80;
    var interval;
    var spinner;
    var numCircles;
    var offsetSize;

    /**
     * @function start - starts or restarts the animation sequence
     * @memberOf fabric.Spinner
     */
    function start() {
        interval = setInterval(function () {
            var i = circleObjects.length;
            while (i--) {
                _fade(circleObjects[i]);
            }
        }, animationSpeed);
    }

    /**
     * @function stop - stops the animation sequence
     * @memberOf fabric.Spinner
     */
    function stop() {
        clearInterval(interval);
    }

    //private methods

    function _init() {
        if (_spinnerType === "sixteen") {
            offsetSize = sixteenSize;
            numCircles = 16;
        } else {
            offsetSize = eightSize;
            numCircles = 8;
        }
        _createCirclesAndArrange();
        _initializeOpacities();
        start();
    }

    function _initializeOpacities() {
        var i = numCircles, j;
        while (i--) {
            j = circleObjects.length;
            while (j--) {
                _fade(circleObjects[j]);
            }
        }
    }

    function _fade(circleObject) {
        var opacity;
        if (circleObject.j < numCircles) {
            if (Math.floor(circleObject.j / (numCircles / 2))) {
                opacity = _getOpacity(circleObject.element) - 2 / numCircles;
            } else {
                opacity = _getOpacity(circleObject.element) + 2 / numCircles;
            }
        } else {
            circleObject.j = 0;
            opacity = 2 / numCircles;
        }
        _setOpacity(circleObject.element, opacity);
        circleObject.j++;
    }

    function _getOpacity(element) {
        return parseFloat(window.getComputedStyle(element).getPropertyValue("opacity"));
    }

    function _setOpacity(element, opacity) {
        element.style.opacity = opacity;
    }

    function _createCircle() {
        var circle = document.createElement('div');
        var parentWidth = parseInt(window.getComputedStyle(spinner).getPropertyValue("width"), 10);
        circle.className = "ms-Spinner-circle";
        circle.style.width = circle.style.height = parentWidth * offsetSize + "px";
        return circle;
    }

    function _createCirclesAndArrange() {
        spinner = document.createElement("div");
        spinner.className = "ms-Spinner";
        _holderElement.appendChild(spinner);
        var width = spinner.clientWidth;
        var height = spinner.clientHeight;
        var angle = 0;
        var offset = width * offsetSize;
        var step = (2 * Math.PI) / numCircles;
        var i = numCircles;
        var circleObject;
        var radius = (width - offset) * 0.5;
        while (i--) {
            var circle = _createCircle();
            var x = Math.round(width * 0.5 + radius * Math.cos(angle) - circle.clientWidth * 0.5) - offset * 0.5;
            var y = Math.round(height * 0.5 + radius * Math.sin(angle) - circle.clientHeight * 0.5) - offset * 0.5;
            spinner.appendChild(circle);
            circle.style.left = x + 'px';
            circle.style.top = y + 'px';
            angle += step;
            circleObject = { element: circle, j: i };
            circleObjects.push(circleObject);
        }
    }

    _init();

    return {
        start: start,
        stop: stop
    };
};

var spin16 = fabric.Spinner(jQuery("#spinner-16point")[0], "sixteen");