module.exports = function( Marker ) {


  const strip = function( unstripped ) {
    //const unstripped = node.property.type === 'Identifier' ? node.property.name : node.property.raw )
    const stripped   = unstripped[0] === '"' || unstripped[0] === "'" ? unstripped.slice(1,-1) : unstripped
    return stripped
  }

  const seqSuffixes = ['once', 'repeat', 'stop']

  return {
    Literal( node, state, cb ) {
      state.push( node.value )
    },
    Identifier( node, state, cb ) {
      state.push( strip( node.name ) )
    },
    AssignmentExpression( expression, state, cb ) {
      // the only assignments we're interested in for annotation purposes are
      // wavepatterns / gen(ish) expressions, and standalone objects like
      // Steps / Arp / Scores. Everything else we can ignore e.g. bass = tracks[0]

      // first check to see if the right operand is a callexpression
      if( expression.right.type === 'CallExpression' ) {

        // if standalone object (Steps, Arp, Score etc.)
        if( Marker.standalone[ expression.right.callee.name ] ) {

          const obj = window[ expression.left.name ]
          if( obj.markup === undefined ) Marker.prepareObject( obj )

          Marker.standalone[ expression.right.callee.name ]( 
            expression.right, 
            state.cm,
            obj,
            expression.left.name,
            state,
            cb
          )            
        }else{
          // if it's a gen~ object we need to store a reference so that we can create wavepattern
          // annotations when appropriate.
          const left = expression.left
          const right= expression.right
          
          Marker.globalIdentifiers[ left.name ] = right

          // XXX does this need a track object? passing null...
          //  Marker.processGen( expression, state.cm, null)

        }
      }

      
    },

    CallExpression( node, state, cb ) {
      cb( node.callee, state )

      let   endIdx = state.length - 1
      const end = state[ endIdx ]
      const foundSequence = state.indexOf( 'seq' ) > -1 // end === 'seq'
      const isMessage = state.indexOf( 'message' ) > -1

      // check to see if .once, .repeat, or .stop is appended to call to .seq
      if( seqSuffixes.indexOf( end ) > -1 ) {
        endIdx--
        if( seqSuffixes.indexOf( node.callee.property.name ) > -1 ) return
        //node = node.callee.property
      }

      if( isMessage === false ) {
        if( foundSequence === true ){
          const hasSeqNumber = node.arguments.length > 2
          
          let seqNumber = 0
          if( hasSeqNumber === true ) {
            seqNumber = node.arguments[2].raw
          }

          const seq = Marker.getObj( state.slice( 0, endIdx ), true, seqNumber )

          Marker.markPatternsForSeq( seq, node.arguments, state, cb, node, seqNumber )
        }else{
          Marker.processGen( node, state.cm, null, null, null, state.indexOf('seq') > -1 ? 0 : -1 )
        }
      }else{
        if( foundSequence === true ){
          const hasSeqNumber = node.arguments.length > 2
          
          let seqNumber = 0
          if( hasSeqNumber === true ) {
            seqNumber = node.arguments[2].raw
          }
          
          state[0] = 'message'
          state[1] = node.arguments[0].value
          state[2] = 'seq'

          let seq
          if( node.arguments.length > 1 ) {
            // this is the call to .seq
            state[1] = node.callee.object.arguments[0].value 
            seq = window.message( node.callee.object.arguments[0].value )
            Marker.markPatternsForSeq( seq, node.arguments, state, cb, node, seqNumber )
          }else{
            // this is the call to message(), which has one argument, the message prefix
            seq = window.message( node.arguments[0].value )
          }

        }
      }

    },
    MemberExpression( node, state, cb ) {
      // XXX why was this here?
      //if( node.object.name === 'tracks' ) state.length = 0

      // for any member name, make sure to get rid of potential quotes surrounding it using
      // the strip function.
      if( node.object.type !== 'Identifier' ) {
        if( node.property ) {
          const unstripped = node.property.type === 'Identifier' ? node.property.name : node.property.raw 
          state.unshift( strip( unstripped ) )
        }
        cb( node.object, state )
      }else{
        if( node.property !== undefined ) { // if the objects is an array member, e.g. tracks[0]
          state.unshift( strip( node.property.raw || node.property.name ) )
        }
        state.unshift( strip( node.object.name ) )
      }

    },
  }
}
