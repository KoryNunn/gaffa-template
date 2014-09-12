var Node = window.Node || window.Element;

Node.prototype.setCustomValidity || (Node.prototype.setCustomValidity = function(){

});

Node.prototype.validity || (Node.prototype.validity = {});