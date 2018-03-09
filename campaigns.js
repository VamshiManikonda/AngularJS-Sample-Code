'use strict';

angular.module('spMerchant.campaigns', ['spMerchant.constants', 'ui.router', 'ngTable', 'mgo-angular-wizard', 'spMerchant.ngTableService','spMerchant.campaignsService', 'spMerchant.listsService', 'oitozero.ngSweetAlert', 'kendo.directives'])
    .config(
        function($stateProvider,$urlRouterProvider, $locationProvider, $httpProvider, USER_ROLES) {
            $stateProvider.state('campaigns', {
                parent: 'site',
                url: '/campaigns',
                views: {
                    'content@': {
                        templateUrl: 'components/campaigns/campaigns.tpl.html',
                        controller: 'CampaignsCtrl'
                    }
                },
                data: {
                    roles: [USER_ROLES.admin, USER_ROLES.merchant]
                }
            });
        })
    .value('campaignSteps', [
        {uiSref: 'campaigns', valid: true},
        {uiSref: 'create-campaign.audience', valid: false},
        {uiSref: 'create-campaign.message', valid: false},
        {uiSref: 'create-campaign.schedule', valid: false},
        {uiSref: 'create-campaigns.review', valid: false}
    ])

    //Campaigns controller - main page
    .controller("CampaignsCtrl",['$http','$scope','$rootScope', '$sce', 'ngTableParams', 'ngTableService' , '$filter', 'ModalService','campaignsService',
        function($http, $scope, $rootScope, $sce, ngTableParams, ngTableService ,$filter, ModalService, campaignsService) {

            $scope.link = "";
            $scope.filterOpen = false;
            $scope.isActivated = false;
            $scope.firstActivation = false;

            $scope.monthSelectorOptions = {
                start: "year",
                depth: "year"
            };
            $scope.getType = function(x) {
                return typeof x;
            };
            $scope.isDate = function(x) {
                return x instanceof Date;
            };

            $scope.toolTip = "The number of recipients for your campaign";

            $scope.ngTable = {
                sorting: true
            };

            $scope.activateIntegration = function () {
                $scope.isActivated = !$scope.isActivated;

                if(!$scope.firstActivation) {
                    $scope.firstActivation = true;

                    campaignsService.campaignsPhp().then(function(data){
                        $scope.link = $sce.trustAsResourceUrl(data.link);
                    });
                }
            };
            $rootScope.campaignsTable = new ngTableParams({
                page: 1,
                count: 10
            }, {
                total: 0,
                getData: function ($defer, params) {
                    campaignsService.getCampaigns().then(function(data){
                        var campaigns = data.data;
                        var filteredData = params.filter() ?
                            $filter('filter')(campaigns, params.filter()) :
                            campaigns;
                        var orderedData = params.sorting() ?
                            $filter('orderBy')(filteredData, params.orderBy()) :
                            campaigns;
                        params.total(orderedData.length);

                        orderedData = orderedData.slice((params.page() - 1) * params.count(), params.page() * params.count());
                        $defer.resolve(orderedData);
                    });
                }
            });

            $scope.createCampaign = function() {
                ModalService.showModal({
                    templateUrl: "components/campaigns/create-campaign.tpl.html",
                    controller: "CreateCampaignCtrl",
                }).then(function(modal) {
                    modal.close.then(function() {
                        console.log("closed modal add");
                        $scope.finishedWizard;
                    });
                });
            };

            $scope.openModalEdit = function(id) {
                ModalService.showModal({
                    templateUrl: "components/campaigns/edit-campaign.tpl.html",
                    controller: "EditCampaignCtrl",
                    inputs: {
                        'campaignId': id
                    }
                }).then(function(modal) {
                    modal.close.then(function() {
                        console.log("closed modal edit");
                        $scope.finishedWizard;
                    });
                });
            };

            $scope.cancel = function() {
                $scope.display = false;
                close(null);
            };
        }])

    .controller("CreateCampaignCtrl", ['$http', '$scope', '$rootScope' ,'close', 'campaignSteps', '$timeout', 'moment', 'SweetAlert','campaignsService','listsService',
        function ($http, $scope, $rootScope ,close, campaignSteps, $timeout, moment, SweetAlert, campaignsService, listsService) {

            $scope.toolTip = "Use lists to define a target audience for your campaign.";
            $scope.data = {targetAudience: 'sms', targetSchedule: 'now'};
            $scope.form = {};
            $scope.data.targetDateSchedule = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');

            listsService.getLists().then(function(data){
                 $scope.campaignsOptions.items = data.data;
            });

            $scope.campaignsOptions = {
                title: 'SELECT YOUR AUDIENCE',
                filterPlaceHolder: 'Start typing to filter the lists below.',
                labelAll: 'Available lists',
                labelSelected: 'Selected lists',
                helpMessage: ' (click on any item to add)',
                orderProperty: 'name',
                visibleFilter: 'hidden',
                items: [],
                selectedItems: []
            };

            $scope.cancel = function() {
                $scope.display = false;
                close(null);
            };
            $scope.date = new Date();
            $scope.date.setDate($scope.date.getDate());
            $scope.dateOptions = {
                min: $scope.date
            };

            $scope.finishedWizard = function() {
                var dates = new Date();
                var i =0;

                if($scope.data.targetSchedule == 'now'){
                    dates = moment(new Date()).format('YYYY-MM-DD HH:mm:ss');
                }else{
                    dates = $scope.data.targetDateSchedule;
                }

                var selected_items=  '';
                for (i = 0; i < $scope.campaignsOptions.selectedItems.length; i++) {
                    selected_items += $scope.campaignsOptions.selectedItems[i].id +(i < $scope.campaignsOptions.selectedItems.length-1 ? "," : "");
                }
                campaignsService.createCampaign($scope.data.targetAudience, $scope.data.targetCampaign, $scope.data.targetMessage, $scope.data.targetUrl, dates, selected_items).then(function(data){
                    SweetAlert.swal("Campaigns", "Campaign saved!", data.result);
                    $scope.cancel();
                    $scope.campaignsTable.reload();
                    $scope.campaignsTable.page(1);
                    $scope.campaignsTable.sorting({});
                });
            };

            $scope.validateCampaignList = function(event) {
                event.preventDefault();
                if ($scope.form.campaignValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.exitStep1 = function() {
                if ($scope.form.campaignValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.validateCampaignListTxt = function(event) {
                event.preventDefault();
                if ($scope.form.campaignTxtValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.exitStep3 = function() {
                if ($scope.form.campaignTxtValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.$watch('data.targetAudience', function() {
            }, true);
        }])

    .controller("EditCampaignCtrl", ['$http', '$scope', 'close', 'campaignSteps', '$timeout', 'moment', 'SweetAlert', 'campaignId','campaignsService','listsService',
        function ($http, $scope, close, campaignSteps, $timeout, moment, SweetAlert, campaignId, campaignsService, listsService) {
            //cancel button - close modal window
            $scope.cancel = function() {
                $scope.display = false;
                close(null);
            };
            $scope.form = {};
            $scope.data={};

            $scope.date = new Date();
            $scope.date.setDate($scope.date.getDate());
            $scope.dateOptions = {
                      min: $scope.date
            };

            campaignsService.getCampaign(campaignId).then(function(data){
                $scope.data = data.data;
                $scope.data.targetCampaign = data.data.name;
                $scope.selected_list_id = data.data.list_ids;
                $scope.data.targetDateSchedule = data.data.sent_at;
                $scope.data.targetMessage = data.data.message_body;
                $scope.data.targetAudience = data.data.type;
                $scope.data.targetUrl = data.data.target_url;
            });

            listsService.getLists().then(function(data){
                var arrayCampaigns = [];
                for(var x = 0; x < data.data.length; x++){
                    arrayCampaigns[x] = {id: data.data[x].id, name: data.data[x].name};
                };

                var arraySelectedID = $scope.selected_list_id.split(',');

                var newSelectedID = [];

                for(var i = 0; i < arrayCampaigns.length; i++){
                    for(var j = 0; j < arraySelectedID.length; j++){
                        if(arrayCampaigns[i].id == arraySelectedID[j]){
                            newSelectedID.push({'id': arrayCampaigns[i].id, 'name':arrayCampaigns[i].name});
                            arrayCampaigns.splice(i, 1);
                        }
                    }
                }
                $scope.campaignsOptions.items = arrayCampaigns;
                $scope.campaignsOptions.selectedItems = newSelectedID;
            });

            $scope.campaignsOptions = {
                title: 'SELECT YOUR AUDIENCE',
                filterPlaceHolder: 'Start typing to filter the lists below.',
                labelAll: 'Available segments',
                labelSelected: 'Selected segments',
                helpMessage: ' Click items to transfer them between fields.',
                orderProperty: 'name',
                visibleFilter: 'hidden',
                items: [],
                selectedItems: []
            };

            $scope.finishedWizard = function() {
                var selected_items=  '';

                for (var i = 0; i < $scope.campaignsOptions.selectedItems.length; i++) {
                    selected_items += $scope.campaignsOptions.selectedItems[i].id +(i < $scope.campaignsOptions.selectedItems.length-1 ? "," : "");
                }
                campaignsService.editCampaign(campaignId, $scope.data.targetAudience, $scope.data.targetCampaign, $scope.data.targetMessage, $scope.data.targetDateSchedule, $scope.data.targetUrl, selected_items).then(function(data){
                      SweetAlert.swal("Campaigns", "Campaign updated!", data.result);
                      $scope.cancel();
                      $scope.campaignsTable.reload();
                      $scope.campaignsTable.page(1);
                      $scope.campaignsTable.sorting({});
                });
            };
            $scope.validateEditCampaignList = function(event) {
                event.preventDefault();
                if ($scope.form.campaignEditValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.exitStep1 = function() {
                if ($scope.form.campaignEditValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.validateEditCampaignListTxt = function(event) {
                event.preventDefault();
                if ($scope.form.editcampaignTxtValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };

            $scope.exitStep3 = function() {
                if ($scope.form.editcampaignTxtValidator.validate()) {
                    return true;
                } else {
                    return false;
                }
            };
        }])

    .controller("DeleteCampaignCtrl", ['$http', '$scope', '$rootScope' , '$timeout', 'moment', 'SweetAlert','campaignsService',
        function ($http, $scope, $rootScope , $timeout, moment, SweetAlert, campaignsService) {

            $scope.deleteCampaign = function (campaignId) {
                SweetAlert.swal({
                        title: "Delete campaign",
                        text: "Are you sure you want to delete this campaign?",
                        type: "warning",
                        showCancelButton: true,
                        confirmButtonColor: "#00a2dd",confirmButtonText: "Yes, delete it!",
                        cancelButtonText: "Cancel",
                        closeOnConfirm: false,
                        closeOnCancel: false },
                    function(isConfirm){
                        if (isConfirm) {
                            campaignsService.deleteCampaign(campaignId).then(function(){
                                SweetAlert.success("Campaigns", "Campaign deleted!");
                                $scope.campaignsTable.reload();
                                $scope.campaignsTable.page(1);
                                $scope.campaignsTable.sorting({});
                            });
                        } else {
                            SweetAlert.swal("Cancelled", "Your campaign was not deleted", "error");
                        }
                    }
                );
            };
        }
    ]);