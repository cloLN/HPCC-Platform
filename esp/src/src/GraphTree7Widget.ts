import * as declare from "dojo/_base/declare";
import * as lang from "dojo/_base/lang";
import "dojo/i18n";
// @ts-ignore
import * as nlsHPCC from "dojo/i18n!hpcc/nls/hpcc";
import * as arrayUtil from "dojo/_base/array";
import * as aspect from "dojo/aspect";
import * as dom from "dojo/dom";
import * as topic from "dojo/topic";

import * as registry from "dijit/registry";

import { hashSum } from "@hpcc-js/util";
import { ScopeGraph, Workunit } from "@hpcc-js/comms";
import { Graph as GraphWidget, Subgraph, Vertex } from "@hpcc-js/graph";

// @ts-ignore
import * as _Widget from "hpcc/_Widget";
import { Grid } from "./ESPUtil";
import * as WsWorkunits from "./WsWorkunits";
import * as Utility from "./Utility";

// @ts-ignore
import * as template from "dojo/text!hpcc/templates/GraphTree7Widget.html";

import "hpcc/TimingTreeMapWidget";
import "dijit/layout/BorderContainer";
import "dijit/layout/TabContainer";
import "dijit/layout/StackContainer";
import "dijit/layout/StackController";
import "dijit/layout/ContentPane";
import "dijit/Dialog";
import "dijit/form/TextBox";
import "dijit/form/SimpleTextarea";
import "dijit/form/NumberSpinner";
import "dijit/form/DropDownButton";
import "dijit/form/Select";

import declareDecorator from './DeclareDecorator';
import { WUScopeController } from "./WUScopeController";
import { GraphStore, GraphTreeStore } from "./GraphStore";
import { WUGraphLegend } from "./WUGraphLegend";

type _Widget = {
    id: string;
    widget: any;
    params: { [key: string]: any };
    inherited(args: any);
    setDisabled(id: string, disabled: boolean, icon?: string, disabledIcon?: string);
};

export interface GraphTree7Widget extends _Widget {
}

@declareDecorator(_Widget)
export class GraphTree7Widget {
    templateString = template;
    static baseClass = "GraphTree7Widget";
    i18n = nlsHPCC;

    GraphName: any;

    subGraphId: string;
    graphTimers: any;
    targetQuery: any;
    queryId: any;

    wuid = "";
    graphName = "";
    subgraphsGrid = null;
    verticesGrid = null;
    edgesGrid = null;
    graphStatus = null;

    findText = "";
    found = [];
    foundIndex = 0;

    _graph: GraphWidget;
    protected _legend: WUGraphLegend;
    _gc = new WUScopeController();
    protected treeStore = new GraphTreeStore();
    protected subgraphsStore = new GraphStore("Id");
    protected verticesStore = new GraphStore("Id");
    protected edgesStore = new GraphStore("Id");

    constructor() {
        this._gc.minClick = (sg: Subgraph) => {
            this.loadGraph(w => {
                this._graph
                    .selection([sg])
                    .centerOnItem(sg)
                    ;
                this.syncSelectionFrom(this._graph);
            });
        };
    }

    //  Data ---
    private _prevHashSum;
    private _prevScopeGraph: Promise<ScopeGraph>;
    fetchScopeGraph(wuid: string, graphID: string, subgraphID: string = "", refresh: boolean = false): Promise<ScopeGraph> {
        this.graphStatus.innerText = "Fetching...";
        const hash = hashSum({
            wuid,
            graphID,
            subgraphID
        });
        if (!this._prevScopeGraph || refresh || this._prevHashSum !== hash) {
            this._prevHashSum = hash;
            this._gc.clear();
            const wu = Workunit.attach({ baseUrl: "" }, wuid);
            this._prevScopeGraph = wu.fetchGraphs().then(graphs => {
                for (const graph of graphs) {
                    if (graph.Name === graphID) {
                        return graph.fetchScopeGraph(subgraphID).then(scopedGraph => {
                            this.graphStatus.innerText = "Loading...";
                            return new Promise<ScopeGraph>((resolve, reject) => {
                                setTimeout(() => {
                                    this._gc.set(scopedGraph);
                                    this._legend.data(this._gc.calcLegend());
                                    resolve(scopedGraph);
                                }, 0);
                            });
                        });
                    }
                }
            });
        }
        return this._prevScopeGraph;
    }
    //  --- ---

    buildRendering(args) {
        this.inherited(arguments);
    }

    postCreate(args) {
        this.inherited(arguments);
        this._initGraphControls();
        var context = this;
        topic.subscribe(this.id + "OverviewTabContainer-selectChild", function (topic) {
            context.refreshActionState();
        });
    }

    startup(args) {
        this.inherited(arguments);

        this.refreshActionState();
    }

    resize(s) {
        this.inherited(arguments);
        this.widget.BorderContainer.resize();
    }

    layout(args) {
        this.inherited(arguments);
    }

    destroy(args) {
        this.inherited(arguments);
    }

    //  Implementation  ---
    _initGraphControls() {
        aspect.after(registry.byId(this.id + "MainBorderContainer"), "resize", () => {
            if (this._graph) {
                this._graph
                    .resize()
                    .render()
                    ;
            }
        });
    }

    _initItemGrid(grid) {
        var context = this;
        grid.on("dgrid-select, dgrid-deselect", function (event) {
            context.syncSelectionFrom(grid);
        });
        grid.on(".dgrid-row:dblclick", function (evt) {
            var item = grid.row(evt).data;
            if (item.Id) {
                let refresh = false;
                let scopeItem = context._gc.scopeItem(item.Id);
                while (scopeItem) {
                    const w = context._gc.item(scopeItem._.Id);
                    if (w && w instanceof Subgraph && w.minState() !== "normal") {
                        w.minState("normal");
                        refresh = true;
                    }
                    scopeItem = scopeItem.parent;
                }
                const w = context._gc.item(item.Id);
                if (refresh) {
                    context._graph
                        .data(context._gc.graphData(), true)   //  Force re-render 
                        .render(w => {
                            setTimeout(() => {
                                context._graph
                                    .centerOnItem(w)
                                    ;
                            }, 1000);
                        });
                } else {
                    context._graph.centerOnItem(w);
                }
            }
        });
    }

    _onRefresh() {
        this.refreshData();
    }

    _onGraphRefresh() {
        this._graph.data().subgraphs.forEach((sg: Subgraph) => {
            sg.minState("normal");
        });
        delete this._graph["_prevLayout"];
        this.loadGraph(w => {
            this._graph.zoomToFit();
        });
    }

    _onPartial(args) {
        this._graph.data().subgraphs.forEach((sg: Subgraph) => {
            sg.minState("partial");
        });
        this.loadGraph(w => {
            this._graph.zoomToFit();
        });
    }

    _onMax(args) {
        this._graph.data().subgraphs.forEach((sg: Subgraph) => {
            sg.minState("normal");
        });
        this.loadGraph(w => {
            this._graph.zoomToFit();
        });
    }

    _onZoomToFit(args) {
        this._graph.zoomToFit();
    }

    _onZoomToWidth(args) {
        this._graph.zoomToWidth();
    }

    _onZoomToPlus(args) {
        this._graph.zoomPlus();
    }

    _onZoomToMinus(args) {
        this._graph.zoomMinus();
    }

    _doFind(prev) {
        if (this.findText !== this.widget.FindField.value) {
            this.findText = this.widget.FindField.value;
            this.found = this._gc.find(this.findText);
            this.syncSelectionFrom(this.found);
            this.foundIndex = -1;
        }
        this.foundIndex += prev ? -1 : +1;
        if (this.foundIndex < 0) {
            this.foundIndex = this.found.length - 1;
        } else if (this.foundIndex >= this.found.length) {
            this.foundIndex = 0;
        }
        if (this.found.length) {
            this._graph.centerOnItem(this._gc.item(this.found[this.foundIndex]));
        }
        this.refreshActionState();
    }

    _onFind(prev) {
        this.findText = "";
        this._doFind(false);
    }

    _onFindNext() {
        this._doFind(false);
    }

    _onFindPrevious() {
        this._doFind(true);
    }

    isWorkunit() {
        return lang.exists("params.Wuid", this);
    }

    isQuery() {
        return lang.exists("params.QueryId", this);
    }

    init(params) {
        if (this.inherited(arguments))
            return;

        this.initGraph();
        this.initSubgraphs();
        this.initVertices();
        this.initEdges();

        this.doInit(params);

        this.refreshActionState();
    }

    refresh(params) {
        if (params.SubGraphId) {
            this.syncSelectionFrom([params.SubGraphId]);
        }
    }

    doInit(params) {
        this.wuid = params.Wuid;
        this.graphName = params.GraphName;
        this.subGraphId = params.SubGraphId;
        this.targetQuery = params.Target;
        this.queryId = params.QueryId;

        this.refreshData();
    }

    refreshData() {
        if (this.isWorkunit()) {
            this.loadGraphFromWu(this.wuid, this.graphName, this.subGraphId, true);
        } else if (this.isQuery()) {
        }
    }

    loadGraphFromWu(wuid, graphName, subGraphId, refresh: boolean = false) {
        this.fetchScopeGraph(wuid, graphName, subGraphId, refresh).then(() => {
            this.loadGraph();
            this.loadSubgraphs();
            this.loadVertices();
            this.loadEdges();
        });
    }

    initGraph() {
        this.graphStatus = dom.byId(this.id + "GraphStatus");
        this._graph = new GraphWidget()
            .target(this.id + "MainGraphWidget")
            .layout("Hierarchy")
            .applyScaleOnLayout(true)
            .showToolbar(false)
            .allowDragging(false)
            .on("vertex_click", sel => {
                this.syncSelectionFrom(this._graph);
            })
            .on("edge_click", sel => {
                this.syncSelectionFrom(this._graph);
            })
            .on("progress", what => {
                this.graphStatus.innerText = what === "end" ? "" : what;
            });
        ;
        this._graph.tooltipHTML((v: Vertex) => {
            return this._gc.calcGraphTooltip2(v);
        });

        this._legend = new WUGraphLegend(this as any)
            .target(this.id + "LegendGrid")
            .on("click", kind => {
                this.loadGraph();
            })
            .on("mouseover", kind => {
                const verticesMap: { [id: string]: boolean } = {};
                for (const vertex of this._gc.vertices(kind)) {
                    verticesMap[vertex.id()] = true;
                }
                this._graph.highlightVerticies(verticesMap);
            })
            .on("mouseout", kind => {
                this._graph.highlightVerticies();
            })
            ;
    }

    loadGraph(callback?) {
        this._gc.disabled(this._legend.disabled());
        this._graph
            .data(this._gc.graphData(), true)
            .render(callback)
            ;
        this._legend
            .render()
            ;
    }

    initSubgraphs() {
        this.subgraphsGrid = new declare([Grid(true, true)])({
            store: this.subgraphsStore
        }, this.id + "SubgraphsGrid");

        this._initItemGrid(this.subgraphsGrid);
    }

    loadSubgraphs() {
        var subgraphs = this._gc.subgraphStoreData();
        this.subgraphsStore.setData(subgraphs);
        var columns = [
            {
                label: this.i18n.ID, field: "Id", width: 54,
                formatter: function (_id, row) {
                    var img = Utility.getImageURL("folder.png");
                    return "<img src='" + img + "'/>&nbsp;" + _id;
                }
            }
        ];
        this.subgraphsStore.appendColumns(columns, [this.i18n.TimeSeconds, "DescendantCount", "SubgraphCount", "ActivityCount"], ["ChildCount", "Depth"]);
        this.subgraphsGrid.set("columns", columns);
        this.subgraphsGrid.refresh();
    }

    initVertices() {
        this.verticesGrid = new declare([Grid(true, true)])({
            store: this.verticesStore
        }, this.id + "VerticesGrid");

        this._initItemGrid(this.verticesGrid);
    }

    loadVertices() {
        var vertices = this._gc.activityStoreData();
        this.verticesStore.setData(vertices);
        var columns = [
            {
                label: this.i18n.ID, field: "Id", width: 54,
                formatter: function (_id, row) {
                    var img = Utility.getImageURL("file.png");
                    return "<img src='" + img + "'/>&nbsp;" + _id;
                }
            },
            { label: this.i18n.Label, field: "Label", width: 150 }
        ];
        this.verticesStore.appendColumns(columns, [], ["Kind", "EclNameList", "EclText", "DefinitionList"]);
        this.verticesGrid.set("columns", columns);
        this.verticesGrid.refresh();
    }

    initEdges() {
        this.edgesGrid = new declare([Grid(true, true)])({
            store: this.edgesStore
        }, this.id + "EdgesGrid");

        this._initItemGrid(this.edgesGrid);
    }

    loadEdges() {
        var edges = this._gc.edgeStoreData();
        this.edgesStore.setData(edges);
        var columns = [
            { label: this.i18n.ID, field: "Id", width: 50 }
        ];
        this.edgesStore.appendColumns(columns, ["Label", "NumRowsProcessed"], ["IdSource", "IdTarget", "SourceIndex", "TargetIndex"]);
        this.edgesGrid.set("columns", columns);
        this.edgesGrid.refresh();
    }

    inSyncSelectionFrom = false;
    syncSelectionFrom(sourceControl) {
        if (!this.inSyncSelectionFrom) {
            this._syncSelectionFrom(sourceControl, this._graph);
        }
    }

    _syncSelectionFrom(sourceControl, graphRef) {
    }

    resetPage() {
    }

    setMainRootItems(globalIDs) {
    }

    refreshMainXGMML() {
    }

    displayGraphs(graphs) {
    }

    refreshActionState() {
        var tab = this.widget.OverviewTabContainer.get("selectedChildWidget");
        this.setDisabled(this.id + "FindPrevious", this.foundIndex <= 0, "iconLeft", "iconLeftDisabled");
        this.setDisabled(this.id + "FindNext", this.foundIndex >= this.found.length - 1, "iconRight", "iconRightDisabled");
        this.setDisabled(this.id + "ActivityMetric", tab.id !== this.id + "ActivitiesTreeMap");
    }
}

GraphTree7Widget.prototype._syncSelectionFrom = Utility.debounce(function (this: GraphTree7Widget, sourceControlOrGlobalIDs) {
    this.inSyncSelectionFrom = true;
    var sourceControl = sourceControlOrGlobalIDs instanceof Array ? null : sourceControlOrGlobalIDs;
    var selectedGlobalIDs = sourceControlOrGlobalIDs instanceof Array ? sourceControlOrGlobalIDs : [];
    if (sourceControl) {
        //  Get Selected Items  ---
        if (sourceControl === this._graph) {
            selectedGlobalIDs = this._graph.selection()
                .map((w: any) => this._gc.rItem(w))
                .filter(item => !!item)
                .map(item => item._.Id);
        } else if (sourceControl === this.verticesGrid || sourceControl === this.edgesGrid || sourceControl === this.subgraphsGrid) {
            var items = sourceControl.getSelected();
            for (var i = 0; i < items.length; ++i) {
                if (lang.exists("Id", items[i])) {
                    selectedGlobalIDs.push(items[i].Id);
                }
            }
        } else if (sourceControl === this.found) {
            selectedGlobalIDs = this.found;
        } else {
            selectedGlobalIDs = sourceControl.getSelectionAsGlobalID();
        }
    }

    //  Set Selected Items  ---
    if (sourceControl !== this.subgraphsGrid && this.subgraphsGrid.store) {
        this.subgraphsGrid.setSelection(selectedGlobalIDs);
    }
    if (sourceControl !== this.verticesGrid && this.verticesGrid.store) {
        this.verticesGrid.setSelection(selectedGlobalIDs);
    }
    if (sourceControl !== this.edgesGrid && this.edgesGrid.store) {
        this.edgesGrid.setSelection(selectedGlobalIDs);
    }

    //  Refresh Graph Controls  ---
    if (sourceControl !== this._graph) {
        const items = this._gc.items(selectedGlobalIDs);
        this._graph.selection(items);
    }

    var propertiesDom = dom.byId(this.id + "Properties");
    propertiesDom.innerHTML = "";
    let html = "";
    for (const id of selectedGlobalIDs) {
        html += this._gc.calcGraphTooltip(id, this.findText);
    }
    propertiesDom.innerHTML = html;
    var context = this;
    if (selectedGlobalIDs.length) {
        var edges = arrayUtil.filter(selectedGlobalIDs, function (id) {
            return id && id.indexOf && id.indexOf("_") >= 0;
        });
        if (edges.length === 1) {
            WsWorkunits.WUCDebug(context.params.Wuid, "<debug:print edgeId='" + edges[0] + "'/>").then(function (response) {
                if (lang.exists("WUDebugResponse.Result", response)) {
                    // context.global.displayTrace(response.WUDebugResponse.Result, propertiesDom);
                }
            });
        }
    }
    this.inSyncSelectionFrom = false;
}, 500, false);
