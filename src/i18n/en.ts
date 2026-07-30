// English dictionary. `ja.ts` is typed against this, so a missing translation
// is a compile error rather than a silent English leak.
export const en = {
  // ---- common ----
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.done': 'Done',
  'common.confirm': 'Confirm',
  'common.remove': 'Remove',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.open': 'Open',
  'common.replace': 'Replace',
  'common.loading': 'loading…',
  'common.loadingMap': 'Loading map data…',
  'common.dismiss': '(click to dismiss)',
  'common.previous': 'Previous',
  'common.next': 'Next',

  // ---- HUD / toolbar ----
  'hud.byCountry': 'By country',
  'hud.byCategory': 'By category',
  'toolbar.search': 'Search',
  'toolbar.searchTitle': 'Search (Ctrl+K)',
  'toolbar.roads': 'Roads',
  'toolbar.roadsTitle': 'Roads overlay — shows where roads actually are',
  'toolbar.settings': 'Settings',

  // ---- legend ----
  'legend.title': 'Legend',
  'legend.drivesRight': 'Drives right',
  'legend.drivesLeft': 'Drives left',
  'legend.covered': 'Covered',
  'legend.limited': 'Limited coverage',
  'legend.hasNotes': 'Has notes',
  'legend.noCoverage': 'No coverage',
  'legend.roads': 'Roads (🛣)',

  // ---- category rail ----
  'rail.browseByCategory': 'Browse by category',
  'rail.tags': 'Tags',
  'rail.noTags': 'No tags yet — add them to notes.',
  'rail.clear': '✕ Clear highlight',

  // ---- country panel ----
  'panel.notes': 'Notes',
  'panel.territories': 'Territories',
  'panel.studyMode': 'Study mode (F)',
  'panel.exitStudyMode': 'Exit study mode (F)',
  'panel.closeEsc': 'Close (Esc)',
  'panel.clearFilter': 'Clear filter',
  'panel.zoomHere': 'Zoom here',
  'panel.offscreenZoom': 'Off-screen — click to zoom',
  'panel.partOf': '‹ Part of {name}',
  'panel.mainland': 'Mainland',
  'panel.islands': 'Islands',
  'panel.allParts': 'All',
  'panel.noteCount_one': '{n} note',
  'panel.noteCount_other': '{n} notes',

  // ---- country ID card ----
  'idcard.domain': 'Domain',
  'idcard.phone': 'Phone',
  'idcard.currency': 'Currency',
  'idcard.drives': 'Drives',
  'idcard.language': 'Language',
  'idcard.coverage': 'Coverage',
  'idcard.drivesLeft': 'Left',
  'idcard.drivesRight': 'Right',
  'idcard.limited': 'Limited',
  'idcard.domainTitle': 'Top-level domain',
  'idcard.phoneTitle': 'Calling code',
  'idcard.drivesTitle': 'Driving side',
  'idcard.limitedTitle': 'Sparse / trekker-only coverage',

  // ---- alphabet block ----
  'alphabet.addChart': '+ chart',
  'alphabet.dropHint': 'Paste or drop the alphabet chart',
  'alphabet.enlarge': 'Click to enlarge',
  'alphabet.caption': '{name} — alphabet',

  // ---- feed ----
  'feed.addFirstNote': 'Add your first note to…',
  'feed.addNote': 'Add a note to…',
  'feed.more': 'more',
  'feed.less': 'less',
  'feed.untitled': 'Untitled note',
  'feed.deleteConfirm': 'Delete this note?',
  'feed.addTo': 'Add a note',
  'feed.addToCategory': 'Add to {name}',

  // ---- entry editor ----
  'editor.newNote': 'New note',
  'editor.editNote': 'Edit note',
  'editor.category': 'Category',
  'editor.titleField': 'Title (optional)',
  'editor.bodyField': 'Note (Markdown)',
  'editor.pickBanner': '🗺 Click prefectures/states on the map to toggle them.',
  'editor.donePicking': 'Done picking',
  'editor.picking': '✓ Picking',
  'editor.noRegions': 'No regions match.',
  'editor.dropzone': 'Paste a screenshot (Ctrl+V), drag images here, or ',
  'editor.ctrlEnter': 'Ctrl+Enter to save',
  'editor.titlePlaceholder': 'e.g. Yellow rear plates on kei cars',
  'editor.bodyPlaceholder':
    'Describe the clue…  **bold**, - lists, `code` supported. Paste a screenshot anywhere.',
  'editor.tags': 'Tags',
  'editor.newTagPlaceholder': 'New tag name…',
  'editor.createTag': '+ Create',
  'editor.appliesTo': 'Applies to',
  'editor.wholeCountry': 'Whole country',
  'editor.specificRegions': 'Specific regions',
  'editor.pickOnMap': '🗺 Pick on map',
  'editor.browse': 'browse',
  'editor.dropzoneEnd': '.',
  'editor.searchRegions': 'Search regions…',
  'editor.screenshots': 'Screenshots',
  'editor.captionPlaceholder': 'caption',
  'editor.save': 'Save',
  'editor.addNote': 'Add note',
  'editor.saving': 'Saving…',
  'editor.unsaved': 'Discard your changes?',
  'editor.keepEditing': 'Keep editing',
  'editor.discard': 'Discard',
  'editor.regionsSelected_one': '{n} region selected',
  'editor.regionsSelected_other': '{n} regions selected',

  // ---- search palette ----
  'search.placeholder': 'Search countries…  (covered are selectable)',
  'search.notCovered': 'Not covered',
  'search.noCoverageTitle': 'No Street View coverage',
  'search.noResults': 'No countries match “{q}”.',
  'search.uncoveredTag': 'uncovered',
  'search.hint': '↑↓ navigate · ↵ open · esc close',

  // ---- offscreen cue ----
  'cue.count_one': '{n} more covered area:',
  'cue.count_other': '{n} more covered areas:',

  // ---- coverage edit ----
  'coverage.banner': '✎ Coverage edit — click a country to cycle full → limited → none.',

  // ---- settings ----
  'settings.title': '⚙ Settings',
  'settings.language': 'Language',
  'settings.mapAppearance': 'Map appearance',
  'settings.colorBySide': 'Color countries by driving side',
  'settings.colorBySideHint':
    'On: right-hand-traffic countries are steel blue, left-hand terracotta. Off: one uniform slate.',
  'settings.limitedAsUncovered': 'Treat limited coverage as uncovered',
  'settings.limitedAsUncoveredHint': 'Hide countries that only have sparse trekker/partial coverage.',
  'settings.uncoveredCountries': 'Uncovered countries',
  'settings.dim': 'Dim',
  'settings.hide': 'Hide',
  'settings.coverage': 'Coverage',
  'settings.editCoverage': '✎ Edit coverage on the map',
  'settings.editCoverageHint':
    'Turns on a mode where clicking any country cycles its tier: full → limited → none. Useful for edge cases or newly-added countries. Saved on top of the built-in list.',
  'settings.experimental': 'Experimental',
  'settings.svOverlay': 'Street View coverage overlay',
  'settings.svOverlayHintA': "Paints Google's actual Street View coverage (the blue lines) over the map. Uses an ",
  'settings.svOverlayHintBold': 'unofficial Google endpoint',
  'settings.svOverlayHintB':
    ' — for personal use only, and it may slow the map down or stop working at any time. If tiles fail to load, the overlay simply won’t appear.',
  'settings.categories': 'Categories',
  'settings.moveUp': 'Move up',
  'settings.moveDown': 'Move down',
  'settings.deleteCategory': 'Delete (notes move to Misc)',
  'settings.miscCannotDelete': 'Misc cannot be deleted',
  'settings.addCategory': '+ Add category',
  'settings.newCategory': 'New category',
  'settings.backup': 'Backup & restore',
  'settings.export': '⬇ Export backup (.zip)',
  'settings.import': '⬆ Import backup…',
  'settings.backupHint':
    'Export downloads a zip of your database + screenshots. Import replaces everything — your current data is copied to a data-backup-… folder first.',
  'settings.importConfirm': 'Replace all current data with “{name}”?',
  'settings.importReplace': 'Import & replace',
  'settings.importing': 'Importing…',
  'settings.movedToMisc_one': '{n} note moved to Misc.',
  'settings.movedToMisc_other': '{n} notes moved to Misc.',

  // ---- toasts ----
  'toast.imported': 'Backup imported. Your previous data was saved to {name}/',

  // ---- default category names (display-only; user-renamed ones show as-is) ----
  'cat.licensePlates': 'License plates',
  'cat.bollards': 'Bollards',
  'cat.roadLines': 'Road lines & markings',
  'cat.signs': 'Signs',
  'cat.utilityPoles': 'Utility poles',
  'cat.language': 'Language & script',
  'cat.architecture': 'Architecture',
  'cat.landscape': 'Landscape & vegetation',
  'cat.roads': 'Roads & shoulders',
  'cat.googleCar': 'Google car & camera generation',
  'cat.phoneDomains': 'Phone codes & domains',
  'cat.misc': 'Misc',


} as const;
