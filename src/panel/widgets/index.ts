import type { Component } from '@motifx/core';
import type { Widget } from '../schema';
import type { Scope, ViewClass } from './base';
import { chartViews } from './chart';
import { detailViews } from './detail';
import { filterViews } from './filter';
import { layoutViews } from './layout';
import { UnknownView, simpleViews } from './simple';
import { tableViews } from './table';
import { treeViews } from './tree';

// The views are named here, not registered on load: the package is marked side-effect free, and a production
// build keeps only what a used binding reaches. Containers build their children through scope.build.
const VIEWS: Record<string, ViewClass> = { ...simpleViews, ...layoutViews, ...filterViews, ...tableViews, ...treeViews, ...detailViews, ...chartViews };

export const knownWidgets = () => Object.keys(VIEWS);

/** The component that draws a widget; a type the panel does not know gets the placeholder. */
export function buildWidget(widget: Widget, scope: Scope): Component {
  const Found = VIEWS[widget.type] ?? UnknownView;
  const view = new Found();
  view.widget = widget;
  view.scope = scope;
  return view;
}

export { entriesOf, fieldOf, formatText, countOf, rowsOf, matches, compareValues } from './base';
export type { Scope } from './base';
