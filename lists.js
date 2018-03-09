'use strict';

angular.module('spMerchant.lists', ['spMerchant.constants', 'ui.router', 'angularModalService', 'mgo-angular-wizard', 'uiGmapgoogle-maps', 'angular-jquery-querybuilder', 'ngSanitize', 'ngCsv', 'ngTable', 'spMerchant.listsService', 'spMerchant.gMapsLists','spMerchant.queryBuilderService','oitozero.ngSweetAlert'])
    .config(['$stateProvider', '$urlRouterProvider', '$locationProvider', '$httpProvider', 'USER_ROLES', 'uiGmapGoogleMapApiProvider',
        function ($stateProvider, $urlRouterProvider, $locationProvider, $httpProvider, USER_ROLES, GoogleMapApi) {
            $stateProvider
                .state('lists', {
                    parent: 'site',
                    url: '/lists',
                    views: {
                        'content@': {
                            templateUrl: 'components/lists/lists.tpl.html',
                            controller: 'ListsCtrl'
                        }
                    },
                    data: {
                        roles: [USER_ROLES.admin, USER_ROLES.merchant]
                    }
                });
            GoogleMapApi.configure({
                v: '3.2',
                libraries: 'places,weather,geometry,visualization,drawing'
            });
        }])

    .controller("ListsCtrl", ['$http', '$scope', '$rootScope', 'uiGmapGoogleMapApi', 'listsService', '$filter', 'ngTableParams','$q', 'ModalService','uiGmapIsReady','gMapsLists','queryBuilderService',
        function($http, $scope, $rootScope, GoogleMapApi, listsService, $filter, ngTableParams, $q, ModalService, uiGmapIsReady, gMapsLists, queryBuilderService) {

            $scope.listsdata2 = [];
            $scope.businessMarkers = {};
            $scope.listsTable = new ngTableParams({
                page : 1, // show first page
                count : 5 // count per page
            }, {
                total : 0, // length of data
                getData : function($defer, params) {

                    listsService.getLists().then(function(data){
                        var tableData = data.data;
                        var filteredData = params.filter() ? $filter('filter')(tableData, params.filter()) : tableData;
                        var orderedData = params.sorting() ? $filter('orderBy')(filteredData, params.orderBy()) : tableData;
                        params.total(orderedData.length);
                        orderedData=orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count());
                        $defer.resolve(orderedData);
                    });
                }
            });

            $scope.listDetailsVisible = false;
            $scope.map = {};

            $scope.createList = function() {
                console.log("hello");
                ModalService.showModal({
                    templateUrl: "components/lists/create-list.tpl.html",
                    controller: "CreateListCtrl"
                }).then(function (modal) {
                    modal.close.then(function () {
                        $scope.listsTable.reload();
                        console.log("closed");
                    });
                });
            };
            listsService.getBusinesses().then(function(data){
                $scope.businessMarkers = data.data;
            });

            GoogleMapApi.then(function(maps) {
                maps.visualRefresh = true;
                $scope.map.bounds = gMapsLists.getDefaultBounds();
                angular.extend($scope, gMapsLists.getMapConfig ());
                $scope.map.markers = $scope.businessMarkers;
            });

            $scope.editList = function(id) {

                ModalService.showModal({
                    templateUrl: "components/lists/edit-list.tpl.html",
                    controller: "EditListCtrl",
                    inputs: {
                        'listId': id
                    }
                }).then(function (modal) {
                    modal.close.then(function () {
                        $scope.listsTable.reload();
                        console.log("closed");
                    });
                });
            };

            $scope.detailsData = {};
            $scope.usersArray = [];

            $scope.viewList = function(e) {
                $scope.showMap=false;
                var data = e;
                $scope.map.polys = {};
                $scope.map.circle = {};
                $scope.map.rectangle = {};

                $scope.detailsData = {
                    id: data.id,
                    name : data.name,
                    recipients : data.recipients,
                    created : data.created,
                    lastsynced : data.last_mailchimp_sync_date,
                    filter_sql : data.filter_sql,
                    filter_json : data.filter_json,
                    mailchimp_list_name : data.mailchimp_list_name,
                    mailchimp_sync_frequency : data.mailchimp_sync_frequency,
                    mailchimp_sync_status : data.mailchimp_sync_status
                };

                if (data.shape_json) {
                    $scope.showMap=true;
                    var shape = JSON.parse(data.shape_json);
                    shape = shape[0];
                    console.log(shape);
                    if (shape.type === 'POLYGON') {
                        $scope.map.polys = gMapsLists.parsePaths(shape.geometry[0]);
                        console.log(shape.geometry[0]);
                        var bounds = gMapsLists.fitBoundsPolyRect(shape.geometry[0]);
                        uiGmapIsReady.promise(1).then(function (instance) {
                            instance.forEach(function (inst) {
                                inst.map.fitBounds(bounds);
                                inst.map.setCenter(bounds.getCenter());
                            });
                        });
                    } else if (shape.type === 'RECTANGLE') {
                        var rectangle_bounds = gMapsLists.parsePathsR(shape.geometry);
                        $scope.map.rectangle.geometry = new google.maps.LatLngBounds(rectangle_bounds[0], rectangle_bounds[1]);
                        var bounds = gMapsLists.fitBoundsPolyRect(shape.geometry);
                        uiGmapIsReady.promise(1).then(function (instance) {
                            instance.forEach(function (inst) {
                                inst.map.fitBounds(bounds);
                                inst.map.setCenter(bounds.getCenter());
                            });
                        });
                    } else if (shape.type === 'CIRCLE') {
                        $scope.map.circle.center = gMapsLists.parsePathsC(shape.geometry);
                        $scope.map.circle.radius = shape.radius;
                        var circle = gMapsLists.fitBoundsCircle(shape.geometry, shape.radius);
                        uiGmapIsReady.promise(1).then(function (instance) {
                            instance.forEach(function (inst) {
                                inst.map.fitBounds(circle.getBounds());
                            });
                        });
                    } else {
//                      $scope.map.polys = gMapsLists.parsePaths(shape.geometry[0]);
                    }
                }
                $scope.listDetailsVisible = true;
            };

            $scope.hideDetails = function(e) {
               $scope.listDetailsVisible = false;
               $scope.map.polys = {};
               $scope.map.circle = {};
               $scope.map.rectangle = {};
               $scope.detailsData = {};
            };

            $scope.downloadCSV = function(id) {
                var deferred = $q.defer();
                listsService.getUsersByList(id).then(function(data) {
                    deferred.resolve(data.data);
                });
                return deferred.promise;
            };

            $scope.getPreviewHeaders = queryBuilderService.getHeaders();
        }])
        .controller("CreateListCtrl", ['$scope', 'close', 'uiGmapGoogleMapApi', 'uiGmapIsReady', '$timeout', '$http', '$q', 'SweetAlert', 'ngTableParams', '$filter', '$rootScope','gMapsLists','listsService','queryBuilderService',
            function ($scope, close, GoogleMapApi, uiGmapIsReady, $timeout, $http, $q, SweetAlert, ngTableParams, $filter, $rootScope, gMapsLists, listsService, queryBuilderService) {

            $scope.data = {
                membershipType: 'live',
                targetAudience: 'all'
            };
            $scope.locationsInPoly = [];
            $scope.groups = [];
            $scope.map = {};
            $scope.tempGroup = {};
            $scope.addingShape = false;
            $scope.savedShape = {};
            $scope.mailchimpLists = [];
            $scope.data.mailchimp = {
                syncFrequency: 'daily'
            };
            $scope.filter = {
                showFilter: false
            };
            $scope.storesTable = new ngTableParams({
                page : 1, // show first page
                count : 5 // count per page
            }, {
                total : 0, // length of data
                getData : function($defer, params) {
                    // use built-in angular filter
                    var filteredData = params.filter() ?
                        $filter('filter')($scope.locationsInPoly, params.filter()) :
                        $scope.locationsInPoly;
                    var orderedData = params.sorting() ?
                        $filter('orderBy')(filteredData, params.orderBy()) :
                        $scope.locationsInPoly;
                    params.total(orderedData.length); // set total for recalc pagination

                    return orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count());
                }
            });

            $scope.$watch('locationsInPoly', function(newVal, oldVal) {
                $scope.storesTable.reload();
            }, true);

            $scope.$watch('data.targetAudience', function (newVal, oldVal) {
                if (newVal == oldVal) {
                    $scope.data.targetAudience = 'all';
                } else {
                    $scope.data.membershipType = 'live';
                }
                console.log("watch called. newVal: " + newVal + ' oldVal: ' + oldVal);
            }, true);

            var selectedShape = null;
            var allShapes = [];

            $scope.shapeFill = {
                color : '#00a2dd',
                weight : 3,
                opacity : '0.5'
            };
            $scope.shapeStroke = {
                color : '#00a2dd',
                weight : 3,
                opacity : '0.5'
            };

            listsService.getBusinesses().then(function(data){
                $scope.businessMarkers = data.data;
            });

            GoogleMapApi.then(function(maps) {
                maps.visualRefresh = true;
                $scope.map.bounds = gMapsLists.getDefaultBounds();
                angular.extend($scope, gMapsLists.getMapConfig());
                $scope.map.markers = $scope.businessMarkers;
            });
            // END GMAPS !!!!!!
            var clearSelection = function () {
                if (selectedShape) {
                    selectedShape.setEditable(false);
                    selectedShape = null;
                }
            };

            var setSelection = function(shape) {
                clearSelection();
                selectedShape = shape;

                if(!shape.saved) {
                    shape.setEditable(true);
                }
                if($scope.groups.length > 1) {
                    highlightGroup(selectedShape);
                }
            };

            var highlightGroup = function (shape) {
                angular.forEach($scope.groups, function(group) {
                    group.highlighted = false;
                });

                // Find which group it belongs to and highlight
                angular.forEach($scope.groups, function(group) {
                    if (group.polygon == shape) {
                        $timeout(function(){
                            group.highlighted = true;
                        });
                        return;
                    }
                });
            };

            $scope.deleteSelectedShape = function () {
                if (selectedShape) {
                    selectedShape.setMap(null);
                    selectedShape = null;
                    $scope.locationsInPoly = [];
                    $scope.addingShape = false;

                    // check if that polygon exists in any group and delete as well
                    angular.forEach($scope.groups, function (group) {
                        if (group.polygon == selectedShape) {
                            var index = $scope.groups.indexOf(group);
                            $scope.groups.splice(index,1);
                            return;
                        }
                    });
                }
            };

            $scope.clearAllShapes = function () {
                angular.forEach(allShapes, function(shape) {
                    shape.setMap(null);
                });
                $scope.locationsInPoly = [];
            };

            $scope.addShape = function () {
                $scope.addingShape = true; // @todo remove?
                displayDrawingControls();
            };

            var displayDrawingControls = function () {
                var drawingManager = $scope.map.drawingManagerControl.getDrawingManager();
                drawingManager.setOptions({drawingControl: true});
            };
            var hideDrawingControls = function () {
                var drawingManager = $scope.map.drawingManagerControl.getDrawingManager();
                drawingManager.setOptions({drawingControl: false});
            };

            var clearTempGroup = function () {
                $scope.tempGroup = {};
                $scope.locationsInPoly = [];
            };

            $scope.cancel = function() {
                $scope.display = false;
                close(null);
            };

            $scope.finishedWizard = function() {
                console.log('DONE!!');

                var filterSql = '', filterJson = '', shape = '';
                if ($scope.builder.builder.getRules() && $scope.filter.showFilter) {
                    filterSql = $scope.builder.builder.getSQL(false).sql;
                    filterJson = angular.toJson($scope.builder.builder.getRules());
                }
                if (selectedShape) {
                    shape = angular.toJson(gMapsLists.inOut().IN([selectedShape], false));
                }
                var dataToSend = {
                    'name': $scope.data.listName,
                    'filter_json': filterJson,
                    'filter_sql': filterSql,
                    'shape_json': shape,
                    'membership_type': $scope.data.membershipType,
                    'mailchimp_sync_frequency': $scope.data.mailchimp.syncFrequency,
                    'mailchimp_list_id': $scope.data.mailchimp.listId,
                    'mailchimp_list_name': $scope.data.mailchimp.listName,
                    'mailchimp_company_name': $scope.data.mailchimp.companyName,
                    'mailchimp_company_address1': $scope.data.mailchimp.companyAddress1,
                    'mailchimp_company_address2': $scope.data.mailchimp.companyAddress2,
                    'mailchimp_company_city': $scope.data.mailchimp.companyCity,
                    'mailchimp_company_prov_state': $scope.data.mailchimp.companyProvince,
                    'mailchimp_company_postal_zip': $scope.data.mailchimp.companyPostal,
                    'mailchimp_company_country': 'CA',
                    'mailchimp_subscription_reminder': $scope.data.mailchimp.companySubscription,
                    'mailchimp_default_from_name': $scope.data.mailchimp.fromName,
                    'mailchimp_default_from_email': $scope.data.mailchimp.fromEmail,
                    'mailchimp_default_subject': $scope.data.mailchimp.defaultSubject,
                    'mailchimp_default_language': 'en'
                };
                console.log(dataToSend);
                listsService.createList(dataToSend).then(function(){
                    SweetAlert.success("Lists", "List saved!");
                    $scope.cancel();
                    $scope.listsTable.page(1);
                    $scope.listsTable.sorting({});
                });
            };

            $scope.validateListName = function(event) {
                event.preventDefault();
                if ($scope.form.listNameValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.exitAudience = function() {
                $scope.data.selectedShape = selectedShape;

                if (selectedShape) {
                    $scope.savedShape = {};
                    console.log(gMapsLists.inOut().IN([selectedShape], false));

                    var tmpIO = gMapsLists.inOut().IN([selectedShape], false);

                    switch (selectedShape.type) {
                        case 'circle':
                            $scope.savedShape.center = gMapsLists.parsePathsC(tmpIO[0].geometry);
                            console.log($scope.savedShape.center);
                            $scope.savedShape.radius = selectedShape.radius;
                            var circle = gMapsLists.fitBoundsCircle(tmpIO[0].geometry, selectedShape.radius);
                            uiGmapIsReady.promise(2).then(function (instance) {
                                instance.forEach(function (inst) {
                                    inst.map.fitBounds(circle.getBounds());
                                });
                            });
                            break;
                        case 'polygon':
                            $scope.savedShape.polys = gMapsLists.parsePaths(tmpIO[0].geometry[0]);
                            var bounds = gMapsLists.fitBoundsPolyRect(tmpIO[0].geometry[0]);
                            uiGmapIsReady.promise(2).then(function (instance) {
                                instance.forEach(function (inst) {
                                    inst.map.fitBounds(bounds);
                                    inst.map.setCenter(bounds.getCenter());
                                });
                            });
                            break;
                        case 'rectangle':
                            var rectBounds = gMapsLists.parsePathsR(tmpIO[0].geometry);
                            $scope.savedShape.geometry = new google.maps.LatLngBounds(rectBounds[0], rectBounds[1]);
                            var bounds = gMapsLists.fitBoundsPolyRect(tmpIO[0].geometry);
                            uiGmapIsReady.promise(2).then(function (instance) {
                                instance.forEach(function (inst) {
                                    inst.map.fitBounds(bounds);
                                    inst.map.setCenter(bounds.getCenter());
                                });
                            });
                            console.log("rectangle");
                            break;
                    }
                    console.log($scope.savedShape);
                }
                if (selectedShape == null && $scope.data.targetAudience == 'zone') {
                    SweetAlert.error("Please draw a shape");
                    return false;
                }
                if ($scope.data.targetAudience == 'all') {
                    delete $scope.data.membershipType;
                }
                if ($scope.form.listNameValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
                console.log($scope.data.targetAudience); // @todo remove
                return true;
            };

            $scope.$watch('data.targetAudience', function(newVal, oldVal) {
                console.log("watch called. newVal: " + newVal + ' oldVal: ' + oldVal);
                if(newVal == oldVal) {
                    return;
                }
                else {
                    initMap();
                }
                console.log($scope.map.markers); // @todo remove
            }, true);

            $scope.refreshMap = function() {
                gMapsLists.getRefreshMap(selectedShape, $scope.savedShape, 1);
            };
            $scope.refreshMap2 = function() {
                gMapsLists.getRefreshMap(selectedShape, $scope.savedShape, 2);
            };

            function initMap() {
                $scope.deleteSelectedShape();
                $scope.locationsInPoly = [];
                $scope.groups = [];
                $scope.tempGroup = {};
                $scope.addingShape = false;
                $scope.map.markers = $scope.businessMarkers;

                uiGmapIsReady.promise().then(function () {
                    console.log('ready');
                    var drawingManager = $scope.map.drawingManagerControl.getDrawingManager();
                    // google.maps.event.clearListeners(drawingManager, 'overlaycomplete');

                    // @todo Add listener once? Bug when switching between options
                    google.maps.event.addListener(drawingManager, 'overlaycomplete', function (e) {
                        // Switch back to non-drawing mode after drawing a shape.
                        drawingManager.setOptions({drawingMode: null});

                        var newShape = e.overlay;
                        newShape.type = e.type;

                        allShapes.push(newShape);
                        console.log("newShape", newShape);

                        checkMarkersInsideShape(newShape);

                        switch (newShape.type) {

                            case google.maps.drawing.OverlayType.CIRCLE:
                                circleEventListeners(newShape);
                                break;

                            case google.maps.drawing.OverlayType.RECTANGLE:
                                rectangleEventListeners(newShape);
                                break;

                            case google.maps.drawing.OverlayType.POLYGON:
                                polygonEventListeners(newShape);
                                break;
                        }
                        google.maps.event.addListener(newShape, 'click', function () {
                            setSelection(newShape);
                        });
                        setSelection(newShape);
                        $timeout(function () {
                            $scope.addingShape = true;
                            hideDrawingControls();
                        });
                    });
                });
            };

            var checkMarkersInsideShape = function (shape) {
                $scope.locationsInPoly = gMapsLists.checkMarkersInsideShape(shape, $scope.map.markers);
                $scope.$apply();
            };

            var circleEventListeners = function (circle) {
                google.maps.event.addListener(circle, 'dragend', function () {
                    checkMarkersInsideShape(circle);
                });
                google.maps.event.addListener(circle, 'radius_changed', function () {
                    checkMarkersInsideShape(circle);
                });
            };

            var rectangleEventListeners = function (rectangle) {
                var dragging = false;

                google.maps.event.addListener(rectangle, 'dragstart', function () {
                    dragging = true;
                });
                google.maps.event.addListener(rectangle, 'dragend', function () {
                    dragging = false;
                    checkMarkersInsideShape(rectangle);
                });
                google.maps.event.addListener(rectangle, 'bounds_changed', function () {
                    if(!dragging)
                        checkMarkersInsideShape(rectangle);
                });
            };

            var polygonEventListeners = function (polygon) {

                var polypath = polygon.getPath();
                console.log("polygon path", polypath);

                var dragging = false;

                google.maps.event.addListener(polypath, 'set_at', function() {
                    if(!dragging)
                        checkMarkersInsideShape(polygon);
                });
                google.maps.event.addListener(polypath, 'insert_at', function() {
                    if(!dragging)
                        checkMarkersInsideShape(polygon);
                });
                google.maps.event.addListener(polypath, 'remove_at', function() {
                    if(!dragging)
                        checkMarkersInsideShape(polygon);
                });
                google.maps.event.addListener(polygon, 'dragend', function() {
                    dragging = false;
                    checkMarkersInsideShape(polygon);
                });
                google.maps.event.addListener(polygon, 'dragstart', function() {
                    dragging = true;
                });
            };
             // Options for query builder

            $scope.builder = queryBuilderService.getQueryBuilderOptns();

            $scope.$on('QueryBuilderValueChanged', function() {
                console.log('QueryBuilderValueChanged fired');
                console.log('Rules');
                console.log($scope.builder.builder.getRules($scope.builder.options));
                $scope.sqlData = $scope.builder.builder.getSQL(false);
                console.log($scope.sqlData);
            });

            $scope.exitFilter = function() {
                console.log('Validation ' + $scope.builder.builder.validate());
                console.log('Rules in getRules allow Invalid TRUE '); console.log($scope.builder.builder.getRules({allow_invalid: true}));
                console.log('Rules in array '); console.log($scope.builder.options.rules);

                console.log('showFilter ' + $scope.filter.showFilter);
                if (!$scope.filter.showFilter) {
                    console.log('not showFilter');
                    return true;
                }

                var rules = $scope.builder.builder.getRules({allow_invalid: true});
                if (rules.rules.length == 0 || rules.valid) {
                    if (rules.rules.length == 0) {
                        $scope.data.filter = {
                            'rules': '',
                            'sql': ''
                        };
                    } else {
                        $scope.data.filter = {
                            'rules': rules.rules,
                            'sql': $scope.builder.builder.getSQL(false).sql
                        };
                    }
                    return true;
                }
                return false;
            };

            $scope.downloadPreviewList = function() {
                var deferred = $q.defer();

                if ($scope.exitFilter()) {
                    $rootScope.$broadcast('load: start');

                    var filterSql = '', shape = '';
                    console.log('GetRules:');
                    console.log($scope.builder.builder.getRules($scope.builder.options));
                    console.log('Rules in options:');
                    console.log($scope.builder.options.rules);

                    if ($scope.builder.builder.getRules() && $scope.filter.showFilter) {
                        filterSql = $scope.builder.builder.getSQL(false).sql;
                        filterSql = filterSql;
                    }

                    if (selectedShape) {
                        shape = gMapsLists.inOut().IN([selectedShape], false);
                        shape = angular.toJson(shape);
                    }
                    listsService.getUsersByCriteria(shape, filterSql, $scope.data.membershipType).then(function(data){
                        $rootScope.$broadcast('load: end');
                        deferred.resolve(data.data);
                    });
                } else {
                    SweetAlert.error('Please select filter');
                    deferred.reject();
                }
                return deferred.promise;
            };

            $scope.getPreviewHeaders = queryBuilderService.getHeaders();

            $scope.form = {};
            $scope.mailChimpLists = listsService.getMailChimpLists($scope.mailchimpLists);

            $scope.mailChimpOptions = {
                dataSource: {
                    transport: {
                        read: function (e) {
                            $scope.mailChimpLists().then(function(data) {
                                data.unshift({
                                    'id': 'new',
                                    'name': 'New list...'
                                });
                                data.unshift({
                                    'id': 'nosync',
                                    'name': 'Do not sync'
                                });
                                e.success(data);
                            });
                        }
                    }
                },
                dataTextField: "name",
                dataValueField: "id"
            };

            $scope.exitMailChimp = function() {
                console.log($scope.data);
                if ($scope.form.validator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.validateMailChimp = function(event) {
                event.preventDefault();
                if ($scope.form.validator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.validateListname=function(event){
                event.preventDefault();

                if($scope.form.validator.validate()){
                    return true;
                } else {
                    return false;
                }
            };

            $scope.getSelectedMailChimpListName = function(listId) {
                var listName = '';
                angular.forEach($scope.mailchimpLists, function(list) {
                    if (list.id == listId) {
                        listName = list.name;
                    }
                });
                return listName;
            };
        }])

    // START Edit Controller
    .controller("EditListCtrl", ['$scope', 'close', 'uiGmapGoogleMapApi', 'uiGmapIsReady', '$timeout', '$http', '$q', 'SweetAlert', 'ngTableParams', '$filter', '$rootScope', 'listId','gMapsLists','listsService','queryBuilderService',
        function ($scope, close, GoogleMapApi, uiGmapIsReady, $timeout, $http, $q, SweetAlert, ngTableParams, $filter, $rootScope, listId, gMapsLists, listsService, queryBuilderService) {
            $scope.data = {};
            $scope.locationsInPoly = [];
            $scope.groups = [];
            $scope.map = {};
            $scope.tempGroup = {};
            $scope.addingShape = false;
            $scope.savedShape = {};
            $scope.mailchimpLists = [];
            $scope.data.mailchimp = {
                syncFrequency: 'daily'
            };
            $scope.filter = {
                showFilter: false
            };
            $scope.businessMarkers = [];
            $scope.storesTable = new ngTableParams({
                page : 1, // show first page
                count : 20 // count per page
            }, {
                total : 0, // length of data
                getData : function($defer, params) {
                    // use built-in angular filter
                    var filteredData = params.filter() ?
                        $filter('filter')($scope.locationsInPoly, params.filter()) :
                        $scope.locationsInPoly;
                    var orderedData = params.sorting() ?
                        $filter('orderBy')(filteredData, params.orderBy()) :
                        $scope.locationsInPoly;
                    params.total(orderedData.length); // set total for recalc pagination

                    return orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count());
                }
            });

            var selectedShape = null;
            var allShapes = [];

            $scope.shapeFill = {
                color : '#00a2dd',
                weight : 3,
                opacity : '0.5'
            };
            $scope.shapeStroke = {
                color : '#00a2dd',
                weight : 3,
                opacity : '0.5'
            };

            // Options for query builder

            $scope.builder = queryBuilderService.getQueryBuilderOptns();

            $scope.$on('QueryBuilderValueChanged', function() {
                console.log('QueryBuilderValueChanged fired');
                console.log('Rules');
                console.log($scope.builder.builder.getRules($scope.builder.options));
                $scope.sqlData = $scope.builder.builder.getSQL(false);
                console.log($scope.sqlData);
            });

            listsService.getBusinesses().then(function(data){
                $scope.businessMarkers = data.data;
            });

            $scope.shapeJSON = {};
            var selectedListId = null;

            $http({
                method: 'POST',
                url: '/campaigns/get_list',
                data: {
                    'list_id': listId
                },
                headers: {'Content-Type': 'application/x-www-form-urlencoded'}
            }).then(function(response) {
                        var data = response.data.data;
                        console.log(data);
                        var audience = 'all';
                        if (data.shape_json) {
                            audience = 'zone';
                        }
                        $scope.data = {
                            listName: data.name,
                            targetAudience: audience,
                            filterJson:data.filter_json,
                            filterSql:data.filter_sql,
                            shape :data.shape_json,
                            membershipType: data.membership_type,
                            mailchimp : {
                               syncFrequency: data.mailchimp_sync_frequency,
                               listId: data.mailchimp_list_id,
                               listName: data.mailchimp_list_name,
                               companyName: data.mailchimp_company_name,
                               companyAddress1: data.mailchimp_company_address1,
                               companyAddress2: data.mailchimp_company_address2,
                               companyCity: data.mailchimp_company_city,
                               companyProvince: data.mailchimp_company_prov_state,
                               companyPostal: data.mailchimp_company_postal_zip,
                               companySubscription: data.mailchimp_subscription_reminder,
                               fromName: data.mailchimp_default_from_name,
                               fromEmail: data.mailchimp_default_from_email,
                               defaultSubject: data.mailchimp_default_subject
                            }
                        };
                        if (data.mailchimp_list_id) {
                            console.log('seeting list id');
                            selectedListId = data.mailchimp_list_id;
                        }

                        if (data.shape_json) {
                           $scope.shapeJSON = JSON.parse(data.shape_json)[0];
                           console.log('shapeJSON');console.log($scope.shapeJSON);
                        }

                        if (data.filter_json) {
                           $scope.filter.showFilter = true;
                           $scope.builder.builder.setRules(JSON.parse(data.filter_json));
                        }
                    },
                    function(err) {
                        console.log("error", err);
                        return err;
                    });

            GoogleMapApi.then(function(maps) {
                maps.visualRefresh = true;
                $scope.map.bounds = gMapsLists.getDefaultBounds();
                angular.extend($scope, gMapsLists.getMapConfig ());
                $scope.map.markers = $scope.businessMarkers;
            });

            var clearSelection = function () {
                if (selectedShape) {
                    selectedShape.setEditable(false);
                    selectedShape = null;
                }
            };

            var setSelection = function(shape) {
                clearSelection();
                selectedShape = shape;
                if(!shape.saved) {
                    shape.setEditable(true);
                }
                if($scope.groups.length > 1) {
                    highlightGroup(selectedShape);
                }
            };

            var highlightGroup = function (shape) {
                angular.forEach($scope.groups, function(group) {
                    group.highlighted = false;
                });
                // Find which group it belongs to and highlight
                angular.forEach($scope.groups, function(group) {
                    if (group.polygon == shape) {
                        $timeout(function(){
                            group.highlighted = true;
                        });
                        return;
                    }
                });
            };

            $scope.deleteSelectedShape = function () {
                if (selectedShape) {
                    try {
                        selectedShape.setMap(null);
                    } catch (err){
                        $scope.savedShape = {};
                    }
                    $scope.savedShape=null;
                    selectedShape = null;
                    $scope.locationsInPoly = [];
                    $scope.addingShape = false;

                    // check if that polygon exists in any group and delete as well
                    angular.forEach($scope.groups, function (group) {
                        if (group.polygon == selectedShape) {
                            var index = $scope.groups.indexOf(group);
                            $scope.groups.splice(index,1);
                            return;
                        }
                    });
                }
            };

            $scope.clearAllShapes = function () {
                angular.forEach(allShapes, function(shape) {
                    shape.setMap(null);
                });
                $scope.locationsInPoly = [];
            };

            $scope.addShape = function () {
                $scope.addingShape = true; // @todo remove?
                displayDrawingControls();
            };

            var displayDrawingControls = function () {
                var drawingManager = $scope.map.drawingManagerControl.getDrawingManager();
                drawingManager.setOptions({drawingControl: true});
            };
            var hideDrawingControls = function () {
                var drawingManager = $scope.map.drawingManagerControl.getDrawingManager();
                drawingManager.setOptions({drawingControl: false});
            };

            var clearTempGroup = function () {
                $scope.tempGroup = {};
                $scope.locationsInPoly = [];
            };

            $scope.cancel = function() {
                $scope.display = false;
                close(null);
            };

            $scope.finishedWizard = function() {
                var filterSql = '', filterJson = '', shape = '';
                if ($scope.builder.builder.getRules() && $scope.filter.showFilter) {
                    filterSql = $scope.builder.builder.getSQL(false).sql;
                    filterJson = angular.toJson($scope.builder.builder.getRules());
                }

                if (selectedShape) {
                    shape = angular.toJson(gMapsLists.inOut().IN([selectedShape], false));
                }

                var dataToSend = {
                    'list_id': listId,
                    'name': $scope.data.listName,
                    'audience':$scope.data.targetAudience,
                    'filter_json': filterJson,
                    'filter_sql': filterSql,
                    'shape_json': shape,
                    'membership_type': $scope.data.membershipType,
                    'mailchimp_sync_frequency': $scope.data.mailchimp.syncFrequency,
                    'mailchimp_list_id': $scope.data.mailchimp.listId,
                    'mailchimp_list_name': $scope.data.mailchimp.listName,
                    'mailchimp_company_name': $scope.data.mailchimp.companyName,
                    'mailchimp_company_address1': $scope.data.mailchimp.companyAddress1,
                    'mailchimp_company_address2': $scope.data.mailchimp.companyAddress2,
                    'mailchimp_company_city': $scope.data.mailchimp.companyCity,
                    'mailchimp_company_prov_state': $scope.data.mailchimp.companyProvince,
                    'mailchimp_company_postal_zip': $scope.data.mailchimp.companyPostal,
                    'mailchimp_company_country': 'CA',
                    'mailchimp_subscription_reminder': $scope.data.mailchimp.companySubscription,
                    'mailchimp_default_from_name': $scope.data.mailchimp.fromName,
                    'mailchimp_default_from_email': $scope.data.mailchimp.fromEmail,
                    'mailchimp_default_subject': $scope.data.mailchimp.defaultSubject,
                    'mailchimp_default_language': 'en'
                };
                console.log(dataToSend);
                listsService.editList(dataToSend).then(function() {
                    SweetAlert.success("Lists", "List saved!");
                    $scope.cancel();
                    $scope.listsTable.sorting({});
                    $scope.listsTable.page(1);
                });
            };

            $scope.validateEditList = function(event) {
                event.preventDefault();
                if ($scope.form.editlistValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.exitAudience = function() {
                $scope.data.selectedShape = selectedShape;
                if (selectedShape) {
                    $scope.savedShape={};
                    console.log(gMapsLists.inOut().IN([selectedShape], false));

                    var tmpIO = gMapsLists.inOut().IN([selectedShape], false);

                    switch (selectedShape.type) {
                        case 'circle':
                            $scope.savedShape.center = gMapsLists.parsePathsC(tmpIO[0].geometry);
                            console.log($scope.savedShape.center);
                            $scope.savedShape.radius = selectedShape.radius;
                            var circle = gMapsLists.fitBoundsCircle(tmpIO[0].geometry, selectedShape.radius);
                            uiGmapIsReady.promise(2).then(function (instance) {
                                instance.forEach(function (inst) {
                                    inst.map.fitBounds(circle.getBounds());
                                });
                            });
                            break;
                        case 'polygon':
                            $scope.savedShape.polys = gMapsLists.parsePaths(tmpIO[0].geometry[0]);
                            var bounds = gMapsLists.fitBoundsPolyRect(tmpIO[0].geometry[0]);
                            uiGmapIsReady.promise(2).then(function (instance) {
                                instance.forEach(function (inst) {
                                    inst.map.fitBounds(bounds);
                                    inst.map.setCenter(bounds.getCenter());
                                });
                            });
                            break;
                        case 'rectangle':
                            var rectBounds = gMapsLists.parsePathsR(tmpIO[0].geometry);
                            $scope.savedShape.geometry = new google.maps.LatLngBounds(rectBounds[0], rectBounds[1]);
                            var bounds = gMapsLists.fitBoundsPolyRect(tmpIO[0].geometry);
                            uiGmapIsReady.promise(2).then(function (instance) {
                                instance.forEach(function (inst) {
                                    inst.map.fitBounds(bounds);
                                    inst.map.setCenter(bounds.getCenter());
                                });
                            });
                            console.log("rectangle");
                            break;
                    }
                    console.log($scope.savedShape);
                }

                if (selectedShape == null && $scope.data.targetAudience == 'zone') {
                    SweetAlert.error("Please draw a shape");
                    return false;
                }
                if ($scope.data.targetAudience == 'all') {
                    delete $scope.data.membershipType;
                }
                if ($scope.form.editlistValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
                console.log($scope.data.targetAudience); // @todo remove
                return true;
            };

            $scope.$watch('data.targetAudience', function(newVal, oldVal) {
                console.log("watch called. newVal: " + newVal + ' oldVal: ' + oldVal);
                if(newVal == oldVal) {
                    return;
                }
                else {
                    initMap();
                }
                console.log($scope.map.markers); // @todo remove
            }, true);

            $scope.refreshMap = function() {
                 gMapsLists.getRefreshMap(selectedShape, $scope.savedShape, 1);
            };
            $scope.refreshMap2 = function() {
                gMapsLists.getRefreshMap(selectedShape, $scope.savedShape, 2);
            };

            function loadShape() {
                if (!angular.equals($scope.shapeJSON, {})) {
                    switch ($scope.shapeJSON.type) {
                        case 'CIRCLE':
                            $scope.savedShape.center = gMapsLists.parsePathsC($scope.shapeJSON.geometry);
                            $scope.savedShape.radius = $scope.shapeJSON.radius;
                            var circle = gMapsLists.fitBoundsCircle($scope.shapeJSON.geometry, $scope.shapeJSON.radius);
                            uiGmapIsReady.promise(1).then(function (instance) {
                                instance.forEach(function (inst) {
                                    inst.map.fitBounds(circle.getBounds());
                                });
                            });
                            console.log('circle shape');
                            console.log($scope.savedShape);
                            break;
                        case 'POLYGON':
                            $scope.savedShape.polys = gMapsLists.parsePaths($scope.shapeJSON.geometry[0]);
                            var bounds = gMapsLists.fitBoundsPolyRect($scope.shapeJSON.geometry[0]);
                            console.log('polygon shape'); console.log($scope.savedShape);
                            uiGmapIsReady.promise(1).then(function (instance) {
                                instance.forEach(function (inst) {
                                    inst.map.fitBounds(bounds);
                                    inst.map.setCenter(bounds.getCenter());
                                });
                            });
                            break;
                        case 'RECTANGLE':
                            var rectBounds = gMapsLists.parsePathsR($scope.shapeJSON.geometry);
                            $scope.savedShape.geometry = new google.maps.LatLngBounds(rectBounds[0], rectBounds[1]);
                            var bounds = gMapsLists.fitBoundsPolyRect($scope.shapeJSON.geometry);
                            uiGmapIsReady.promise(1).then(function (instance) {
                                instance.forEach(function (inst) {
                                    inst.map.fitBounds(bounds);
                                    inst.map.setCenter(bounds.getCenter());
                                });
                            });
                            break;
                    }
                    selectedShape = $scope.savedShape;
                    $scope.addingShape = true;
                    console.log('adding shape val ' + $scope.addingShape);
                }
            }

            function initMap() {
                $scope.deleteSelectedShape();
                $scope.locationsInPoly = [];
                $scope.groups = [];
                $scope.tempGroup = {};
                $scope.addingShape = false;

                $timeout(function(){
                    $scope.map.markers = $scope.businessMarkers;
                    loadShape();
                }, 300);

                uiGmapIsReady.promise().then(function () {
                    console.log('ready');

                    var drawingManager = $scope.map.drawingManagerControl.getDrawingManager();
                    // google.maps.event.clearListeners(drawingManager, 'overlaycomplete');

                    // @todo Add listener once? Bug when switching between options
                    google.maps.event.addListener(drawingManager, 'overlaycomplete', function (e) {
                        // Switch back to non-drawing mode after drawing a shape.
                        drawingManager.setOptions({drawingMode: null});

                        var newShape = e.overlay;
                        newShape.type = e.type;

                        allShapes.push(newShape);
                        console.log("newShape", newShape);

                        checkMarkersInsideShape(newShape);

                        switch (newShape.type) {

                            case google.maps.drawing.OverlayType.CIRCLE:
                                circleEventListeners(newShape);
                                break;

                            case google.maps.drawing.OverlayType.RECTANGLE:
                                rectangleEventListeners(newShape);
                                break;

                            case google.maps.drawing.OverlayType.POLYGON:
                                polygonEventListeners(newShape);
                                break;
                        }

                        google.maps.event.addListener(newShape, 'click', function () {
                            setSelection(newShape);
                        });
                        setSelection(newShape);
                        $timeout(function () {
                            $scope.addingShape = true;
                            hideDrawingControls();
                        });
                    });
                });
            };

            var checkMarkersInsideShape = function (shape) {
                $scope.locationsInPoly = gMapsLists.checkMarkersInsideShape(shape, $scope.map.markers);
                $scope.$apply();
            };

            var circleEventListeners = function (circle) {
                google.maps.event.addListener(circle, 'dragend', function () {
                    checkMarkersInsideShape(circle);
                });
                google.maps.event.addListener(circle, 'radius_changed', function () {
                    checkMarkersInsideShape(circle);
                });
            };

            var rectangleEventListeners = function (rectangle) {
                var dragging = false;

                google.maps.event.addListener(rectangle, 'dragstart', function () {
                    dragging = true;
                });
                google.maps.event.addListener(rectangle, 'dragend', function () {
                    dragging = false;
                    checkMarkersInsideShape(rectangle);
                });
                google.maps.event.addListener(rectangle, 'bounds_changed', function () {
                    if(!dragging)
                        checkMarkersInsideShape(rectangle);
                });
            };

            var polygonEventListeners = function (polygon) {

                var polypath = polygon.getPath();
                console.log("polygon path", polypath);

                var dragging = false;

                google.maps.event.addListener(polypath, 'set_at', function() {
                    if(!dragging)
                        checkMarkersInsideShape(polygon);
                });
                google.maps.event.addListener(polypath, 'insert_at', function() {
                    if(!dragging)
                        checkMarkersInsideShape(polygon);
                });
                google.maps.event.addListener(polypath, 'remove_at', function() {
                    if(!dragging)
                        checkMarkersInsideShape(polygon);
                });
                google.maps.event.addListener(polygon, 'dragend', function() {
                    dragging = false;
                    checkMarkersInsideShape(polygon);
                });
                google.maps.event.addListener(polygon, 'dragstart', function() {
                    dragging = true;
                });
            };

            $scope.exitFilter = function() {
                console.log('Validation ' + $scope.builder.builder.validate());
                console.log('Rules in getRules allow Invalid TRUE '); console.log($scope.builder.builder.getRules({allow_invalid: true}));
                console.log('Rules in array '); console.log($scope.builder.options.rules);

                console.log('showFilter ' + $scope.filter.showFilter);
                if (!$scope.filter.showFilter) {
                    console.log('not showFilter');
                    return true;
                }
                var rules = $scope.builder.builder.getRules({allow_invalid: true});
                if (rules.rules.length == 0 || rules.valid) {
                    if (rules.rules.length == 0) {
                        $scope.data.filter = {
                            'rules': '',
                            'sql': ''
                        };
                    } else {
                        $scope.data.filter = {
                            'rules': rules.rules,
                            'sql': $scope.builder.builder.getSQL(false).sql
                        };
                    }
                    return true;
                }
                return false;
            };

            $scope.downloadPreviewList = function() {
                var deferred = $q.defer();

                if ($scope.exitFilter()) {
                    $rootScope.$broadcast('load: start');

                    var filterSql = '', shape = '';
                    console.log('GetRules:');
                    console.log($scope.builder.builder.getRules($scope.builder.options));
                    console.log('Rules in options:');
                    console.log($scope.builder.options.rules);

                    if ($scope.builder.builder.getRules() && $scope.filter.showFilter) {
                        filterSql = $scope.builder.builder.getSQL(false).sql;
                        filterSql = filterSql;
                    }
                    if (selectedShape) {
                        shape = gMapsLists.inOut().IN([selectedShape], false);
                        shape = angular.toJson(shape);
                    }
                    listsService.getUsersByCriteria(shape, filterSql, $scope.data.membershipType).then(function(data){
                        $rootScope.$broadcast('load: end');
                        deferred.resolve(data.data);
                    });
                } else {
                    SweetAlert.error('Please select filter');
                    deferred.reject();
                }
                return deferred.promise;
            };

            $scope.getPreviewHeaders = queryBuilderService.getHeaders();

            $scope.form = {};
            $scope.mailChimpLists = listsService.getMailChimpLists($scope.mailchimpLists);

            $scope.mailChimpOptions = {
                dataSource: {
                    transport: {
                        read: function (e) {
                            $scope.mailChimpLists().then(function(data) {
                                data.unshift({
                                    'id': 'new',
                                    'name': 'New list...'
                                });
                                data.unshift({
                                    'id': 'nosync',
                                    'name': 'Do not sync'
                                });
                                e.success(data);
                            });
                        }
                    }
                },
                dataBound: function() {
                    if (selectedListId) {
                        console.log('bound and set');
                        $scope.data.mailchimp.listId = selectedListId;
                    }
                },
                dataTextField: "name",
                dataValueField: "id",
            };

            $scope.exitMailChimp = function() {
                console.log($scope.data);
                if($scope.form.validator.validate()){
                    return true;
                }else {
                    return false;
                }
            };

            $scope.validateMailChimp = function(event) {
                event.preventDefault();
                if ($scope.form.validator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.getSelectedMailChimpListName = function(listId) {
                var listName = '';
                angular.forEach($scope.mailchimpLists, function(list) {
                    if (list.id == listId) {
                        listName = list.name;
                    }
                });
                return listName;
            };
        }])

 // Delete List Controller
        .controller("DeleteListCtrl", ['$http', '$scope', '$rootScope', '$timeout', 'moment', 'SweetAlert', 'listsService',
            function ($http, $scope, $rootScope, $timeout, moment, SweetAlert, listsService) {
                $scope.deleteList = function (listId) {
                    SweetAlert.swal({
                        title: "Delete list",
                        text: "Are you sure you want to delete this list?",
                        type: "warning",
                        showCancelButton: true,
                        confirmButtonColor: "#00a2dd", confirmButtonText: "Yes, delete it!",
                        cancelButtonText: "Cancel",
                        closeOnConfirm: false,
                        closeOnCancel: false
                    },
                    function (isConfirm) {
                        if (isConfirm) {
                            listsService.deleteList(listId).then(function () {
                                SweetAlert.success("Lists", "List has been deleted!");
                                $scope.listsTable.reload();
                                $scope.listsTable.page(1);
                                $scope.listsTable.sorting({});
                            });
                        } else {
                            SweetAlert.swal("Cancelled", "Your lists was not deleted", "error");
                        }
                    });
                };
            }]);
