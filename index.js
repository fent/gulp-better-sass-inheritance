'use strict';

var path = require('path');
var es = require('event-stream');
var _ = require('lodash');
var vfs = require('vinyl-fs');
var sassGraph = require('sass-graph');
var gutil = require('gulp-util');
var PluginError = gutil.PluginError;
var PLUGIN_NAME = 'gulp-better-sass-inheritance';


function gulpBetterSassInheritance(options) {
	options = options || {};

	var stream;
	var files = [];
	var filesPaths = [];
	var graph;
	var modifiedTimeGraph;

	if (!options.base) {
		throw new PluginError(PLUGIN_NAME, 'Missing option `base`!');
	}

	var basePath = path.resolve(process.cwd(), options.base);

	// gutil.log(basePath)

	function writeStream(currentFile) {
		if (currentFile && currentFile.contents.length) {
			files.push(currentFile);
		}
	}

	function check(_filePaths) {
		_.forEach(_filePaths, function (filePath) {
			filesPaths = _.union(filesPaths, [filePath]);
			if (graph.index && graph.index[filePath]) {
				var fullpaths = graph.index[filePath].importedBy;

				if (options.debug) {
					gutil.log('File \"', gutil.colors.magenta(path.relative(basePath, filePath)), '\"');
					gutil.log(' - importedBy', fullpaths);
				}
				filesPaths = _.union(filesPaths, fullpaths);
			}
			if (fullpaths) {
				return check(fullpaths);
			}
		});
		return true;
	}

	function getLastModifiedTime() {
		var map = {};
		for (var filepath in graph.index) {
			var node = graph.index[filepath];
			var parentsModified = getModified(node, 'importedBy');
			var childrenModified = getModified(node, 'imports');
			map[filepath] = new Date(Math.max(node.modified, parentsModified, childrenModified))
		}
		return map;
	}

	function getModified(node, key) {
		return Math.max.apply(null, node[key].map(function(filepath) {
			var node = graph.index[filepath];
			return node ? Math.max(node.modified, getModified(node, key)) : 0;
		}));
	}

	function endStream() {
		if (files.length) {
			graph = sassGraph.parseDir(options.base, options);
			modifiedTimeGraph = getLastModifiedTime(graph);

			check(_.map(files, function (item) {
				return item.path;
			}));

			vfs.src(filesPaths, {'base': options.base})
				.pipe(es.through(
					function (f) {
						if (modifiedTimeGraph[f.path]) {
							f.stat.mtime = modifiedTimeGraph[f.path];
							f.stat.mtimeMs = modifiedTimeGraph[f.path].getTime();
						}
						stream.emit('data', f);
					},
					function () {
						stream.emit('end');
					}
				));
		} else {
			stream.emit('end');
		}
	}

	stream = es.through(writeStream, endStream);

	return stream;
}
module.exports = gulpBetterSassInheritance;
