var camelize = Ember.String.camelize,
    capitalize = Ember.String.capitalize,
    get = Ember.get,
    map = Ember.ArrayPolyfills.map,
    registeredTransforms;

var passthruTransform = {
  serialize: function(value) { return value; },
  deserialize: function(value) { return value; }
};

var defaultTransforms = {
  string: passthruTransform,
  boolean: passthruTransform,
  number: passthruTransform
};

function camelizeKeys(json) {
  var value;

  for (var prop in json) {
    value = json[prop];
    delete json[prop];
    json[camelize(prop)] = value;
  }
}

function munge(json, callback) {
  callback(json);
}

function applyTransforms(json, type, transformType) {
  var transforms = registeredTransforms[transformType];

  Ember.assert("You are trying to apply the '" + transformType + "' transforms, but you didn't register any transforms with that name", transforms);

  get(type, 'attributes').forEach(function(name, attribute) {
    var attributeType = attribute.type,
        value = json[name];

    var transform = transforms[attributeType] || defaultTransforms[attributeType];

    Ember.assert("Your model specified the '" + attributeType + "' type for the '" + name + "' attribute, but no transform for that type was registered", transform);

    json[name] = transform.deserialize(value);
  });
}

function ObjectProcessor(json, type, store) {
  this.json = json;
  this.type = type;
  this.store = store;
}

ObjectProcessor.prototype = {
  load: function() {
    this.store.load(this.type, {}, this.json);
  },

  camelizeKeys: function() {
    camelizeKeys(this.json);
    return this;
  },

  munge: function(callback) {
    munge(this.json, callback);
    return this;
  },

  applyTransforms: function(transformType) {
    applyTransforms(this.json, this.type, transformType);
    return this;
  }
};

function processorFactory(store, type) {
  return function(json) {
    return new ObjectProcessor(json, type, store);
  };
}

function ArrayProcessor(json, type, array, store) {
  this.json = json;
  this.type = type;
  this.array = array;
  this.store = store;
}

ArrayProcessor.prototype = {
  load: function() {
    var store = this.store,
        type = this.type;

    var references = this.json.map(function(object) {
      return store.load(type, {}, object);
    });

    this.array.load(references);
  },

  camelizeKeys: function() {
    this.json.forEach(camelizeKeys);
    return this;
  },

  munge: function(callback) {
    this.json.forEach(function(object) {
      munge(object, callback);
    });
    return this;
  },

  applyTransforms: function(transformType) {
    var type = this.type;

    this.json.forEach(function(object) {
      applyTransforms(object, type, transformType);
    });

    return this;
  }
};

function arrayProcessorFactory(store, type, array) {
  return function(json) {
    return new ArrayProcessor(json, type, array, store);
  };
}

var HasManyProcessor = function(json, store, record, relationship) {
  this.json = json;
  this.store = store;
  this.record = record;
  this.type = record.constructor;
  this.relationship = relationship;
};

HasManyProcessor.prototype = Ember.create(ArrayProcessor.prototype);

HasManyProcessor.prototype.load = function() {
  var store = this.store;
  var ids = map.call(this.json, function(obj) { return obj.id; });

  store.loadMany(this.relationship.type, this.json);
  store.loadHasMany(this.record, this.relationship.key, ids);
};

function hasManyProcessorFactory(store, record, relationship) {
  return function(json) {
    return new HasManyProcessor(json, store, record, relationship);
  };
}

DS.BasicAdapter = DS.Adapter.extend({
  find: function(store, type, id) {
    var sync = type.sync;

    Ember.assert("You are trying to use the BasicAdapter to find id '" + id + "' of " + type + " but " + type + ".sync was not found", sync);
    Ember.assert("The sync code on " + type + " does not implement find(), but you are trying to find id '" + id + "'.", sync.find);

    sync.find(id, processorFactory(store, type));
  },

  findQuery: function(store, type, query, recordArray) {
    var sync = type.sync;

    Ember.assert("You are trying to use the BasicAdapter to query " + type + " but " + type + ".sync was not found", sync);
    Ember.assert("The sync code on " + type + " does not implement query(), but you are trying to query " + type + ".", sync.query);

    sync.query(query, arrayProcessorFactory(store, type, recordArray));
  },

  findHasMany: function(store, record, relationship, any) {
    var name = capitalize(relationship.key),
        sync = record.constructor.sync,
        processor = hasManyProcessorFactory(store, record, relationship);

    if (sync['find'+name]) {
      sync['find' + name](record, processor);
    } else if (sync.findHasMany) {
      sync.findHasMany(record, relationship.key, processor);
    } else {
      Ember.assert("You are trying to use the BasicAdapter to find the " + relationship.key + " has-many relationship, but " + record.constructor + ".sync did not implement findHasMany or find" + name + ".", false);
    }
  }
});

DS.registerTransforms = function(kind, object) {
  registeredTransforms[kind] = object;
};

DS.clearTransforms = function() {
  registeredTransforms = {};
};

DS.clearTransforms();
