import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const viewTicketDetails = async () => {
  try {
    const mongoURI = String(process.env.MONGODB_URI || '').trim();
    if (!mongoURI) {
      throw new Error('MONGODB_URI is required');
    }
    
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB\n');

    const tickets = await mongoose.connection.db.collection('tradetickets').find({}).toArray();
    
    console.log('=== TICKET SYSTEM DATA FOR ADMIN REFERENCE ===\n');
    console.log(`📊 Total Tickets: ${tickets.length}\n`);
    
    if (tickets.length === 0) {
      console.log('No tickets found in database.\n');
    } else {
      tickets.forEach((ticket, index) => {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`TICKET ${index + 1}: ${ticket.ticketId}`);
        console.log('='.repeat(80));
        
        // Basic Info
        console.log('\n📝 BASIC INFORMATION:');
        console.log(`   Ticket ID: ${ticket.ticketId}`);
        console.log(`   Cryptocurrency: ${ticket.cryptocurrency}`);
        console.log(`   Status: ${ticket.status}`);
        console.log(`   Created: ${ticket.createdAt}`);
        console.log(`   Last Updated: ${ticket.updatedAt}`);
        
        // Creator Info
        console.log('\n👤 CREATOR:');
        console.log(`   Creator ID: ${ticket.creator}`);
        console.log(`   Creator Role: ${ticket.creatorRole || 'Not selected'}`);
        
        // Participants
        console.log('\n👥 PARTICIPANTS:');
        if (ticket.participants && ticket.participants.length > 0) {
          ticket.participants.forEach((p, i) => {
            console.log(`   ${i + 1}. User ID: ${p.user}`);
            console.log(`      Status: ${p.status}`);
            console.log(`      Role: ${p.role || 'Not selected'}`);
            console.log(`      Added At: ${p.addedAt}`);
          });
        } else {
          console.log('   No participants yet');
        }
        
        // Role Status
        console.log('\n🎭 ROLE SELECTION STATUS:');
        console.log(`   Roles Confirmed: ${ticket.rolesConfirmed ? 'YES ✓' : 'NO ✗'}`);
        console.log(`   Role Selection Shown: ${ticket.roleSelectionShown ? 'YES' : 'NO'}`);
        if (ticket.roleConfirmations) {
          console.log(`   Confirmations: ${JSON.stringify(Object.fromEntries(ticket.roleConfirmations))}`);
        }
        
        // Messages
        console.log(`\n💬 MESSAGES (${ticket.messages.length}):`);
        if (ticket.messages && ticket.messages.length > 0) {
          ticket.messages.slice(-5).forEach((msg, i) => {
            const time = new Date(msg.timestamp).toLocaleString();
            if (msg.isBot) {
              console.log(`   ${i + 1}. [BOT] ${msg.embedData?.title || msg.content} (${time})`);
              if (msg.embedData?.actionType) {
                console.log(`      → Action Type: ${msg.embedData.actionType}`);
              }
            } else {
              console.log(`   ${i + 1}. [USER ${msg.sender}] ${msg.content} (${time})`);
            }
          });
          if (ticket.messages.length > 5) {
            console.log(`   ... and ${ticket.messages.length - 5} more messages`);
          }
        } else {
          console.log('   No messages');
        }
        
        // Additional Info
        console.log('\n📋 ADDITIONAL DATA:');
        console.log(`   Has Shown Prompt: ${ticket.hasShownPrompt ? 'Yes' : 'No'}`);
        if (ticket.escrowAmount) {
          console.log(`   Escrow Amount: ${ticket.escrowAmount}`);
        }
        if (ticket.escrowAddress) {
          console.log(`   Escrow Address: ${ticket.escrowAddress}`);
        }
        if (ticket.closedAt) {
          console.log(`   Closed At: ${ticket.closedAt}`);
          console.log(`   Closed By: ${ticket.closedBy}`);
        }
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Admin ticket data retrieval complete!\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

viewTicketDetails();

