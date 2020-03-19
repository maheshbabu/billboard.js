/**
 * Copyright (c) 2017 ~ present NAVER Corp.
 * billboard.js project is licensed under the MIT license
 */
import {
	namespaces as d3Namespaces,
	mouse as d3Mouse,
	select as d3Select
} from "d3-selection";
import {d3Selection} from "../../../types/types";
import CLASS from "../../config/classes";
import {document} from "../../module/browser";
import {getBoundingRect, getRandom, isFunction, isObject, isObjectType, isValue, toArray, notEmpty} from "../../module/util";

const getTransitionName = () => getRandom();

export default {
	hasValidPointType(type?: string): boolean {
		return /^(circle|rect(angle)?|polygon|ellipse|use)$/i.test(type || this.config.point_type);
	},

	hasValidPointDrawMethods(type?: string): boolean {
		const pointType = type || this.config.point_type;

		return isObjectType(pointType) &&
			isFunction(pointType.create) && isFunction(pointType.update);
	},

	initialOpacityForCircle(d): "1" | "0" {
		const {withoutFadeIn} = this.state;

		return this.getBaseValue(d) !== null &&
			withoutFadeIn[d.id] ? this.opacityForCircle(d) : "0";
	},

	opacityForCircle(d): "0.5" | "1" | "0" {
		const opacity = this.config.point_show ? "1" : "0";

		return isValue(this.getBaseValue(d)) ?
			(this.isBubbleType(d) || this.isScatterType(d) ?
				"0.5" : opacity) : "0";
	},

	initCircle(): void {
		const $$ = this;
		const {config, $el: {main}} = $$;

		$$.point = $$.generatePoint();

		if (config.point_show) {
			main.select(`.${CLASS.chart}`)
				.append("g")
				.attr("class", CLASS.chartCircles);
		}
	},

	updateTargetForCircle(t): void {
		const $$ = this;
		const {config, data, $el} = $$;
		const targets = t || data.targets;
		const classCircles = $$.classCircles.bind($$);

		if (!$el.circle && config.point_show) {
			$$.initCircle();
		}

		const mainCircle = $el.main.select(`.${CLASS.chartCircles}`)
			.style("pointer-events", "none")
			.selectAll(`.${CLASS.circles}`)
			.data(targets)
			.attr("class", classCircles);

		const mainCircleEnter = mainCircle.enter();

		// Circles for each data point on lines
		config.data_selection_enabled && mainCircleEnter.append("g")
			.attr("class", d => $$.generateClass(CLASS.selectedCircles, d.id));

		mainCircleEnter.append("g")
			.attr("class", classCircles)
			.style("cursor", d => (config.data_selection_isselectable.bind($$.api)(d) ? "pointer" : null));

		// Update date for selected circles
		targets.forEach(t => {
			$el.main.selectAll(`.${CLASS.selectedCircles}${$$.getTargetSelectorSuffix(t.id)}`)
				.selectAll(`${CLASS.selectedCircle}`)
				.each(d => {
					d.value = t.values[d.index].value;
				});
		});
	},

	updateCircle(): void {
		const $$ = this;
		const {config, $el} = $$;

		if (!config.point_show) {
			return;
		}

		const circles = $el.main.selectAll(`.${CLASS.circles}`).selectAll(`.${CLASS.circle}`)
			.data(d => !$$.isBarType(d) && (
				!$$.isLineType(d) || $$.shouldDrawPointsForLine(d)
			) && $$.labelishData(d)
			);

		circles.exit().remove();

		const fn = $$.point("create", this, $$.pointR.bind($$), $$.color);

		$el.circle = circles.enter()
			.append(fn)
			.merge(circles)
			.style("stroke", $$.color)
			.style("opacity", $$.initialOpacityForCircle.bind($$));
	},

	redrawCircle(cx: number, cy: number, withTransition: boolean, flow) {
		const $$ = this;
		const {state: {rendered}, $el: {circle, main}} = $$;
		const selectedCircles = main.selectAll(`.${CLASS.selectedCircle}`);

		if (!$$.config.point_show) {
			return [];
		}

		const fn = $$.point("update", $$, cx, cy, $$.color, withTransition, flow, selectedCircles);
		const posAttr = $$.isCirclePoint() ? "c" : "";

		const t: any = getRandom();
		const opacityStyleFn = $$.opacityForCircle.bind($$);

		const mainCircles: any[] = [];

		circle.each(function(d) {
			let result: d3Selection | any = fn.bind(this)(d);

			result = ((withTransition || !rendered) ? result.transition(t) : result)
				.style("opacity", opacityStyleFn);

			mainCircles.push(result);
		});

		return [
			mainCircles,
			selectedCircles
				.attr(`${posAttr}x`, cx)
				.attr(`${posAttr}y`, cy)
		];
	},

	circleX(d): number | null {
		const $$ = this;
		const {x, zoom} = $$.scale;
		const hasValue = isValue(d.x);

		return $$.config.zoom_enabled && zoom ?
			(hasValue ? zoom(d.x) : null) :
			(hasValue ? x(d.x) : null);
	},

	updateCircleY(): void {
		const $$ = this;
		const getPoints = $$.generateGetLinePoints($$.getShapeIndices($$.isLineType), false);

		$$.circleY = (d, i) => {
			const id = d.id;

			return $$.isGrouped(id) ?
				getPoints(d, i)[0][1] :
				$$.getYScaleById(id)($$.getBaseValue(d));
		};
	},

	getCircles(i: number, id: string) {
		const $$ = this;
		const suffix = (isValue(i) ? `-${i}` : ``);

		return (id ? $$.$el.main.selectAll(`.${CLASS.circles}${$$.getTargetSelectorSuffix(id)}`) : $$.$el.main)
			.selectAll(`.${CLASS.circle}${suffix}`);
	},

	expandCircles(i: number, id: string, reset?: boolean): void {
		const $$ = this;
		const r = $$.pointExpandedR.bind($$);

		reset && $$.unexpandCircles();

		const circles = $$.getCircles(i, id).classed(CLASS.EXPANDED, true);
		const scale = r(circles) / $$.config.point_r;
		const ratio = 1 - scale;

		if ($$.isCirclePoint()) {
			circles.attr("r", r);
		} else {
			// transform must be applied to each node individually
			circles.each(function() {
				const point = d3Select(this);

				if (this.tagName === "circle") {
					point.attr("r", r);
				} else {
					const {width, height} = this.getBBox();
					const x = ratio * (+point.attr("x") + width / 2);
					const y = ratio * (+point.attr("y") + height / 2);

					point.attr("transform", `translate(${x} ${y}) scale(${scale})`);
				}
			});
		}
	},

	unexpandCircles(i): void {
		const $$ = this;
		const r = $$.pointR.bind($$);

		const circles = $$.getCircles(i)
			.filter(function() {
				return d3Select(this).classed(CLASS.EXPANDED);
			})
			.classed(CLASS.EXPANDED, false);

		circles.attr("r", r);

		!$$.isCirclePoint() &&
			circles.attr("transform", `scale(${r(circles) / $$.config.point_r})`);
	},

	pointR(d): number {
		const $$ = this;
		const {config} = $$;
		const pointR = config.point_r;
		let r = pointR;

		if ($$.isStepType(d)) {
			r = 0;
		} else if ($$.isBubbleType(d)) {
			r = $$.getBubbleR(d);
		} else if (isFunction(pointR)) {
			r = pointR.bind($$.api)(d);
		}

		return r;
	},

	pointExpandedR(d): number {
		const $$ = this;
		const {config} = $$;
		const scale = $$.isBubbleType(d) ? 1.15 : 1.75;

		return config.point_focus_expand_enabled ?
			(config.point_focus_expand_r || $$.pointR(d) * scale) : $$.pointR(d);
	},

	pointSelectR(d): number {
		const $$ = this;
		const selectR = $$.config.point_select_r;

		return isFunction(selectR) ?
			selectR(d) : (selectR || $$.pointR(d) * 4);
	},

	isWithinCircle(node, r?: number): boolean {
		const mouse = d3Mouse(node);
		const element = d3Select(node);
		const prefix = this.isCirclePoint() ? "c" : "";

		let cx = +element.attr(`${prefix}x`);
		let cy = +element.attr(`${prefix}y`);

		// if node don't have cx/y or x/y attribute value
		if (!(cx || cy) && node.nodeType === 1) {
			const {x, y} = getBoundingRect(node);

			cx = x;
			cy = y;
		}

		return Math.sqrt(
			Math.pow(cx - mouse[0], 2) + Math.pow(cy - mouse[1], 2)
		) < (r || this.config.point_sensitivity);
	},

	insertPointInfoDefs(point, id: string): void {
		const $$ = this;
		const copyAttr = (from, target) => {
			const attribs = from.attributes;

			for (let i = 0, name; (name = attribs[i]); i++) {
				name = name.name;
				target.setAttribute(name, from.getAttribute(name));
			}
		};

		const doc = new DOMParser().parseFromString(point, "image/svg+xml");
		const node = doc.documentElement;
		const clone = document.createElementNS(d3Namespaces.svg, node.nodeName.toLowerCase());

		clone.id = id;
		clone.style.fill = "inherit";
		clone.style.stroke = "inherit";

		copyAttr(node, clone);

		if (node.childNodes && node.childNodes.length) {
			const parent = d3Select(clone);

			if ("innerHTML" in clone) {
				parent.html(node.innerHTML);
			} else {
				toArray(node.childNodes).forEach(v => {
					copyAttr(v, parent.append(v.tagName).node());
				});
			}
		}

		$$.$el.defs.node().appendChild(clone);
	},

	pointFromDefs(id: string) {
		return this.$el.defs.select(`#${id}`);
	},

	updatePointClass(d) {
		const $$ = this;
		const {circle} = $$.$el;
		let pointClass = false;

		if (isObject(d) || circle) {
			pointClass = d === true ?
				circle.each(function(d) {
					let className = $$.classCircle.bind($$)(d);

					if (this.classList.contains(CLASS.EXPANDED)) {
						className += ` ${CLASS.EXPANDED}`;
					}

					this.setAttribute("class", className);
				}) : $$.classCircle(d);
		}

		return pointClass;
	},

	generatePoint(): Function {
		const $$ = this;
		const {config, state: {datetimeId}} = $$;
		const ids: string[] = [];
		const pattern = notEmpty(config.point_pattern) ? config.point_pattern : [config.point_type];

		return function(method, context, ...args) {
			return function(d) {
				const id: string = d.id || (d.data && d.data.id) || d;
				const element = d3Select(this);

				ids.indexOf(id) < 0 && ids.push(id);

				let point = pattern[ids.indexOf(id) % pattern.length];

				if ($$.hasValidPointType(point)) {
					point = $$[point];
				} else if (!$$.hasValidPointDrawMethods(point)) {
					const pointId = `${datetimeId}-point-${id}`;
					const pointFromDefs = $$.pointFromDefs(pointId);

					if (pointFromDefs.size() < 1) {
						$$.insertPointInfoDefs(point, pointId);
					}

					if (method === "create") {
						return $$.custom.create.bind(context)(element, pointId, ...args);
					} else if (method === "update") {
						return $$.custom.update.bind(context)(element, ...args);
					}
				}

				return point[method].bind(context)(element, ...args);
			};
		};
	},

	custom: {
		create(element, id, sizeFn, fillStyleFn) {
			return element.append("use")
				.attr("xlink:href", `#${id}`)
				.attr("class", this.updatePointClass.bind(this))
				.style("fill", fillStyleFn)
				.node();
		},

		update(element, xPosFn, yPosFn, fillStyleFn,
			withTransition, flow, selectedCircles) {
			const {width, height} = element.node().getBBox();

			const xPosFn2 = d => xPosFn(d) - width / 2;
			const yPosFn2 = d => yPosFn(d) - height / 2;
			let mainCircles = element;

			if (withTransition) {
				const transitionName = getTransitionName();

				flow && mainCircles.attr("x", xPosFn2);

				mainCircles = mainCircles.transition(transitionName);
				selectedCircles.transition(getTransitionName());
			}

			return mainCircles
				.attr("x", xPosFn2)
				.attr("y", yPosFn2)
				.style("fill", fillStyleFn);
		}
	},

	// 'circle' data point
	circle: {
		create(element, sizeFn, fillStyleFn) {
			return element.append("circle")
				.attr("class", this.updatePointClass.bind(this))
				.attr("r", sizeFn)
				.style("fill", fillStyleFn)
				.node();
		},

		update(element, xPosFn, yPosFn, fillStyleFn,
			withTransition, flow, selectedCircles) {
			const $$ = this;
			let mainCircles = element;

			// when '.load()' called, bubble size should be updated
			if ($$.hasType("bubble")) {
				mainCircles.attr("r", $$.pointR.bind($$));
			}

			if (withTransition) {
				const transitionName = getTransitionName();

				flow && mainCircles.attr("cx", xPosFn);

				if (mainCircles.attr("cx")) {
					mainCircles = mainCircles.transition(transitionName);
				}

				selectedCircles.transition(getTransitionName());
			}

			return mainCircles
				.attr("cx", xPosFn)
				.attr("cy", yPosFn)
				.style("fill", fillStyleFn);
		}
	},

	// 'rectangle' data point
	rectangle: {
		create(element, sizeFn, fillStyleFn) {
			const rectSizeFn = d => sizeFn(d) * 2.0;

			return element.append("rect")
				.attr("class", this.updatePointClass.bind(this))
				.attr("width", rectSizeFn)
				.attr("height", rectSizeFn)
				.style("fill", fillStyleFn)
				.node();
		},

		update(element, xPosFn, yPosFn, fillStyleFn,
			withTransition, flow, selectedCircles) {
			const $$ = this;
			const r = $$.config.point_r;
			const rectXPosFn = d => xPosFn(d) - r;
			const rectYPosFn = d => yPosFn(d) - r;

			let mainCircles = element;

			if (withTransition) {
				const transitionName = getTransitionName();

				flow && mainCircles.attr("x", rectXPosFn);

				mainCircles = mainCircles.transition(transitionName);
				selectedCircles.transition(getTransitionName());
			}

			return mainCircles
				.attr("x", rectXPosFn)
				.attr("y", rectYPosFn)
				.style("fill", fillStyleFn);
		}
	}
};
