import epcis = require('./epcisevents');
import xml2js = require('xml2js');
import assert = require('assert');

export module EPCIS {
	export class EpcisParser {
		parser: any;

		constructor() {
			// options to parse the EPCIS xml structure into JS
			// we need all attributes to e.g. get the bizLocation tyepes
			// use array in all cases, that we just have one way to handle events
			// instead of checking for a possible occuring array all the time
			var parserOptions = {
				'trim': true,
				'ignoreAttrs': false,
				'explicitArray': true
			};
			this.parser = new xml2js.Parser(parserOptions);
		}

		// parses the XML into JSON
		// be aware, that it won't be the same structure, but slightly different!
		// it should be a more JSON appropriate result
		// especially the lists will be split into separate event objects - if possible	
		parse(xml: string, callback: (err, res: epcis.EPCIS.Events) => void): void {

			assert.notEqual(null, this.parser, 'Parser must be initialized here!');
			
			var ref = this; // how to handle this scope issue???
			this.parser.parseString(xml, function(err, data) {
				assert.equal(null, err, 'Parsing XML data failed!');

				// result
				var result:epcis.EPCIS.Events = new epcis.EPCIS.Events();

				// we only care for events
				var eventList = ref.getFirstElementIfExists(data['epcis:EPCISDocument']['EPCISBody'][0]['EventList'], null);

				//var fs = require('fs');
				//fs.writeFile('tmp2.json', JSON.stringify(eventList, null, 4));

				var objectEvents = eventList['ObjectEvent'];
				if(objectEvents) {
					//console.log('objectEvent:');
					//console.log(objectEvent);
					var events:epcis.EPCIS.ObjectEvent[] = [];
					for(var i=0; i<objectEvents.length; i++) {
						var oe:epcis.EPCIS.ObjectEvent = ref.parseObjectEvent(objectEvents[i]);
						events.push(oe);
					}
					var msg = JSON.stringify(oe, null, 4);
					//console.log(oe);
					result.objectEvents = events;
					
				}

				var aggregationEvents = eventList['AggregationEvent'];
				if(aggregationEvents) {
					var aggregations:Array<epcis.EPCIS.AggregationEvent> = new Array<epcis.EPCIS.AggregationEvent>();
					for(var i=0; i < aggregationEvents.length; i++) {
						var ev = ref.parseAggregationEvent(aggregationEvents[i]);
						aggregations.push(ev);
					}
					result.aggregationEvents = aggregations;
				}

				var transactionEvents = eventList['TransactionEvent'];
				if(transactionEvents) {
					var transactions:Array<epcis.EPCIS.TransactionEvent> = new Array<epcis.EPCIS.TransactionEvent>();
					for(var i=0; i < transactionEvents.length; i++) {
						var trans = ref.parseTransactionEvent(transactionEvents[i]);
						transactions.push(trans);
					}
					result.transactionEvents = transactions;
				}
				
				callback(null, result);

			});

		}
		

		
		parseObjectEvent(object: Object) : epcis.EPCIS.ObjectEvent {
			var event = <epcis.EPCIS.ObjectEvent>this.parseEpcisEvent(object, new epcis.EPCIS.ObjectEvent());
			
			event.action = this.getFirstElementIfExists(object['action'], undefined);
			var epcs = this.getEpcList(object['epcList']);
			if(epcs.length === 1) {
				event.epc = epcs [0];
			} else if(epcs.length > 1) {
				event.epcList = epcs;
			}

			event.ilmd = this.getFirstElementIfExists(object['ilmd'], undefined);
			return event;
		}

		parseAggregationEvent(object: Object) : epcis.EPCIS.AggregationEvent {
			var event = <epcis.EPCIS.AggregationEvent>this.parseEpcisEvent(object, new epcis.EPCIS.AggregationEvent());

			event.action = this.getFirstElementIfExists(object['action'], undefined);
			event.parentID = this.getFirstElementIfExists(object['parentID'], undefined);
			event.childEPCs = this.getEpcList(object['childEPCs']);
			event.childQuantityList = this.getQuantityList(object['childQuantityList']);
			return event;
		}

		parseTransactionEvent(object: Object) : epcis.EPCIS.TransactionEvent {
			var event = <epcis.EPCIS.TransactionEvent>this.parseEpcisEvent(object, new epcis.EPCIS.TransactionEvent());

			event.action = this.getFirstElementIfExists(object['action'], undefined);
			event.parentID = this.getFirstElementIfExists(object['parentID'], undefined);
			event.quantityList = this.getQuantityList(object['quantityList']);

			// TODO: not sure if we can keep this single vs. multiple EPCs...
			var epcs = this.getEpcList(object['epcList']);
			if(epcs.length === 1) {
				event.epc = epcs[0];
			} else if(epcs.length > 1) {
				event.epcList = epcs;
			}

			return event;
		}

		parseEpcisEvent(object: Object, event:epcis.EPCIS.EpcisEvent) : epcis.EPCIS.EpcisEvent {
			event.eventTime = this.getFirstElementIfExists(object['eventTime'], undefined);
			event.recordTime = this.getFirstElementIfExists(object['recordTime'], undefined);
			event.eventTimeZoneOffset = this.getFirstElementIfExists(object['eventTimeZoneOffset'], undefined);
			event.bizStep = this.getFirstElementIfExists(object['bizStep'], undefined);
			event.disposition = this.getFirstElementIfExists(object['disposition'], undefined);
			event.readPoint = this.getFirstElementIdValueIfExists(object['readPoint'], undefined);
			event.bizLocation = this.getFirstElementIdValueIfExists(object['bizLocation'], undefined);
			var bizTransactions = this.getBizTransactionList(this.getFirstElementIfExists(object['bizTransactionList'], null));
			if(bizTransactions.length === 1) {
				event.bizTransaction = bizTransactions[0];
			} else if (bizTransactions.length > 1) {
				event.bizTransactionList = bizTransactions;
			}

			return event;
		}
		
		getFirstElementIfExists(object: Object, defaultValue: Object) {
			try {
				return object[0];
			} catch (error) {
				return defaultValue;
			}
		}
		
		getFirstElementIdValueIfExists(object: Object, defaultValue: Object) {
			try {
				return object[0]["id"][0];
			} catch (error) {
				return defaultValue;
			}
		}
		
		getBizTransactionList(object: Object) {
			var result = new Array<epcis.EPCIS.BizTransaction>();
			
			try {
				if(object) {
					var transaction = object['bizTransaction'];
					if(transaction) {

						var element = new epcis.EPCIS.BizTransaction();
						element.id = transaction[0]['_'];
						element.type = transaction[0]['$']['type'];
						result.push(element);
					}
				}
			} catch (error) {
				// don't do anyting. in any case of an error, the list is just empty
			}
			
			return result;
		}

		getEpcList(object: Object): Array<string> {
			var result:Array<string> = new Array<string>();
			try {
				result = object[0]['epc'];
			} catch (error) {

			}

			return result;
		}

		// TODO: Check error handling.
		// Currently the whole list is empty if a parsing erro, e.g. quantity, occurs.
		getQuantityList(object: Object): Array<epcis.EPCIS.Quantity> {
			var result:Array<epcis.EPCIS.Quantity> = new Array<epcis.EPCIS.Quantity>();
			try {
				var quantityElements = object[0]['quantityElement'];
				quantityElements.forEach(function(element) {
					var item:epcis.EPCIS.Quantity = new epcis.EPCIS.Quantity();
					item.setEpcClass(this.getFirstElementIfExists(element['epcClass']));
					item.quantity = parseFloat(this.getFirstElementIfExists(element['quantity']));
					item.unit = this.getFirstElementIfExists(element['uom']);

					result.push(item);
				}, this);
			} catch (error) {

			}
			return result;
		}
	}
}
